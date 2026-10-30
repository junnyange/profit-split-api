import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_COOKIE, AuthService } from './auth.service';
import { IS_PUBLIC } from './public.decorator';

// Cookie 헤더에서 이름으로 값 하나를 꺼낸다 (cookie-parser를 추가하지 않으려고)
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

// 전역 가드: @Public()이 아닌 모든 요청은 유효한 접속 쿠키가 있어야 한다
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (this.auth.verify(readCookie(req.headers.cookie, AUTH_COOKIE))) return true;
    throw new UnauthorizedException({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: '접속 코드를 입력해 주세요',
    });
  }
}
