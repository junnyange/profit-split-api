import {
  HttpException, HttpStatus, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import { Clock } from '../common/clock';

export const AUTH_COOKIE = 'ps_auth';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30일
export const MAX_FAILS = 5;
export const LOCK_MS = 15 * 60 * 1000; // 15분

interface Failure {
  count: number; // 연속 실패 횟수
  lastAt: number;
  lockedUntil: number;
}

// 길이가 달라도 상수 시간에 비교하려고 둘 다 SHA-256으로 같은 길이(32바이트)로 만든다
function safeEqual(a: string, b: string): boolean {
  const hash = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}

@Injectable()
export class AuthService {
  private readonly code: string;
  private readonly secret: string;
  private readonly secure: boolean;
  // shortcut: 실패 기록을 메모리(Map)에 둔다. 서버 1대 기준이고, 재시작하면 초기화된다.
  // 서버를 여러 대로 늘리면 Redis 같은 공용 저장소로 옮길 것.
  private readonly failures = new Map<string, Failure>();

  constructor(
    config: ConfigService,
    private readonly clock: Clock,
  ) {
    this.code = config.get<string>('APP_ACCESS_CODE') ?? '';
    this.secret = config.get<string>('APP_COOKIE_SECRET') ?? '';
    // 실수로 잠금 없이 배포되는 것을 막으려고, 없으면 서버가 시작하지 않는다
    if (!this.code) {
      throw new Error('APP_ACCESS_CODE 환경변수가 없어서 서버를 시작하지 않습니다');
    }
    if (this.secret.length < 32) {
      throw new Error('APP_COOKIE_SECRET 환경변수가 없거나 32자보다 짧아서 서버를 시작하지 않습니다');
    }
    this.secure = config.get('NODE_ENV') === 'production';
  }

  // 맞으면 쿠키에 넣을 토큰을 돌려준다. 틀리면 401, IP별 연속 5번 실패하면 15분 동안 429
  login(code: string, ip: string): string {
    const now = this.clock.now().getTime();
    this.prune(now);
    const prev = this.failures.get(ip);
    if (prev && prev.lockedUntil > now) throw tooManyAttempts(prev.lockedUntil - now);

    if (safeEqual(code, this.code)) {
      this.failures.delete(ip);
      return this.issue(now);
    }

    // 마지막 실패에서 15분이 지났으면 횟수를 처음부터 센다
    const count = (prev && now - prev.lastAt < LOCK_MS ? prev.count : 0) + 1;
    if (count >= MAX_FAILS) {
      this.failures.set(ip, { count: 0, lastAt: now, lockedUntil: now + LOCK_MS });
      throw tooManyAttempts(LOCK_MS);
    }
    this.failures.set(ip, { count, lastAt: now, lockedUntil: 0 });
    throw new UnauthorizedException({
      statusCode: 401,
      code: 'INVALID_CODE',
      message: '접속 코드가 맞지 않습니다',
      remainingAttempts: MAX_FAILS - count,
    });
  }

  // 토큰 = "만료시각.서명". 서명에 접속 코드도 넣어서, 코드를 바꾸면 기존 쿠키가 모두 무효가 된다
  verify(token: string | undefined): boolean {
    const [exp, sig] = token?.split('.') ?? [];
    if (!exp || !sig || !(Number(exp) > this.clock.now().getTime())) return false;
    return safeEqual(sig, this.sign(exp));
  }

  cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.secure, maxAge: SESSION_MS, path: '/' };
  }

  private issue(now: number): string {
    const exp = String(now + SESSION_MS);
    return `${exp}.${this.sign(exp)}`;
  }

  private sign(exp: string): string {
    return createHmac('sha256', this.secret).update(`${exp}.${this.code}`).digest('base64url');
  }

  // 잠금이 끝났고 마지막 실패도 15분 지난 기록은 지운다 (Map이 계속 커지지 않게)
  private prune(now: number): void {
    for (const [ip, f] of this.failures) {
      if (f.lockedUntil <= now && now - f.lastAt >= LOCK_MS) this.failures.delete(ip);
    }
  }
}

function tooManyAttempts(remainingMs: number) {
  return new HttpException(
    {
      statusCode: 429,
      code: 'TOO_MANY_ATTEMPTS',
      message: '접속 코드를 여러 번 틀려서 잠시 막혔습니다. 잠시 후 다시 시도하세요',
      retryAfterSeconds: Math.ceil(remainingMs / 1000),
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
