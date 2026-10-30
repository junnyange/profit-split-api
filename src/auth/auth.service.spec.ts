import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../common/clock';
import { AuthService, LOCK_MS, MAX_FAILS } from './auth.service';

// 테스트 전용 가짜 값 (실제 접속 코드와 무관)
const FAKE_CODE = '0000';
const FAKE_SECRET = 'test-secret-'.padEnd(40, 'x');

function setup(env: Record<string, string | undefined> = {}) {
  let now = new Date('2026-10-30T12:00:00+09:00').getTime();
  const values: Record<string, string | undefined> = {
    APP_ACCESS_CODE: FAKE_CODE,
    APP_COOKIE_SECRET: FAKE_SECRET,
    ...env,
  };
  const config = { get: (k: string) => values[k] } as unknown as ConfigService;
  const clock = { now: () => new Date(now) } as Clock;
  const service = new AuthService(config, clock);
  return { service, advance: (ms: number) => (now += ms) };
}

function errorOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('예외가 나지 않음');
}

describe('AuthService', () => {
  it('APP_ACCESS_CODE가 없으면 생성(=서버 시작) 실패', () => {
    expect(() => setup({ APP_ACCESS_CODE: undefined })).toThrow('APP_ACCESS_CODE');
    expect(() => setup({ APP_ACCESS_CODE: '' })).toThrow('APP_ACCESS_CODE');
  });

  it('APP_COOKIE_SECRET이 없거나 32자 미만이면 실패', () => {
    expect(() => setup({ APP_COOKIE_SECRET: undefined })).toThrow('APP_COOKIE_SECRET');
    expect(() => setup({ APP_COOKIE_SECRET: 'short' })).toThrow('APP_COOKIE_SECRET');
  });

  it('맞는 코드 → 토큰 발급, verify 통과', () => {
    const { service } = setup();
    const token = service.login(FAKE_CODE, '1.1.1.1');
    expect(service.verify(token)).toBe(true);
  });

  it('틀린 코드 → 401 INVALID_CODE', () => {
    const { service } = setup();
    const e = errorOf(() => service.login('9999', '1.1.1.1'));
    expect(e).toBeInstanceOf(UnauthorizedException);
    expect(e.getResponse()).toMatchObject({ code: 'INVALID_CODE', remainingAttempts: MAX_FAILS - 1 });
  });

  it('같은 IP에서 5번 연속 틀리면 429, 15분 동안은 맞는 코드도 429, 다른 IP는 영향 없음', () => {
    const { service, advance } = setup();
    for (let i = 1; i < MAX_FAILS; i++) {
      expect(errorOf(() => service.login('9999', '1.1.1.1')).getStatus()).toBe(401);
    }
    const fifth = errorOf(() => service.login('9999', '1.1.1.1'));
    expect(fifth.getStatus()).toBe(429);
    expect(fifth.getResponse()).toMatchObject({ code: 'TOO_MANY_ATTEMPTS', retryAfterSeconds: 900 });

    advance(LOCK_MS - 1000);
    expect(errorOf(() => service.login(FAKE_CODE, '1.1.1.1')).getStatus()).toBe(429);
    expect(service.verify(service.login(FAKE_CODE, '2.2.2.2'))).toBe(true);

    advance(1000); // 15분 지남
    expect(service.verify(service.login(FAKE_CODE, '1.1.1.1'))).toBe(true);
  });

  it('성공하면 실패 횟수 초기화, 마지막 실패에서 15분 지나도 초기화', () => {
    const { service, advance } = setup();
    for (let i = 0; i < MAX_FAILS - 1; i++) errorOf(() => service.login('9999', 'ip'));
    service.login(FAKE_CODE, 'ip');
    expect(errorOf(() => service.login('9999', 'ip')).getResponse()).toMatchObject({ remainingAttempts: MAX_FAILS - 1 });

    for (let i = 0; i < MAX_FAILS - 2; i++) errorOf(() => service.login('9999', 'ip'));
    advance(LOCK_MS);
    expect(errorOf(() => service.login('9999', 'ip')).getResponse()).toMatchObject({ remainingAttempts: MAX_FAILS - 1 });
  });

  it('verify: 위조/만료/형식 오류/코드 변경 시 실패', () => {
    const { service, advance } = setup();
    const token = service.login(FAKE_CODE, 'ip');
    const [exp, sig] = token.split('.');

    expect(service.verify(undefined)).toBe(false);
    expect(service.verify('garbage')).toBe(false);
    expect(service.verify(`${Number(exp) + 1}.${sig}`)).toBe(false); // 만료시각 조작
    expect(service.verify(`${exp}.${sig.slice(0, -1)}A`)).toBe(false); // 서명 조작

    // 같은 비밀값이어도 접속 코드가 바뀌면 기존 쿠키 무효
    expect(setup({ APP_ACCESS_CODE: '1111' }).service.verify(token)).toBe(false);

    advance(30 * 24 * 60 * 60 * 1000); // 30일 지남
    expect(service.verify(token)).toBe(false);
  });

  it('쿠키 옵션: httpOnly, SameSite=Lax, 30일, 기본 Secure (COOKIE_SECURE=false일 때만 끔)', () => {
    expect(setup().service.cookieOptions()).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, maxAge: 2592000000 });
    expect(setup({ COOKIE_SECURE: 'false' }).service.cookieOptions().secure).toBe(false);
  });
});
