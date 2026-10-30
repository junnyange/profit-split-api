import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, readCookie } from './auth.guard';
import { AuthService } from './auth.service';

function context(cookie?: string): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers: { cookie } }) }),
  } as unknown as ExecutionContext;
}

function guard(isPublic: boolean, validToken = 'good') {
  const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
  const auth = { verify: (t?: string) => t === validToken } as unknown as AuthService;
  return new AuthGuard(reflector, auth);
}

describe('AuthGuard', () => {
  it('@Public() 이면 쿠키 없이 통과 (health, auth)', () => {
    expect(guard(true).canActivate(context())).toBe(true);
  });

  it('쿠키가 없으면 401 UNAUTHORIZED', () => {
    try {
      guard(false).canActivate(context());
      throw new Error('통과하면 안 됨');
    } catch (e) {
      expect(e).toBeInstanceOf(UnauthorizedException);
      expect((e as UnauthorizedException).getResponse()).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    }
  });

  it('틀린 쿠키는 401, 맞는 쿠키는 통과', () => {
    expect(() => guard(false).canActivate(context('ps_auth=bad'))).toThrow(UnauthorizedException);
    expect(guard(false).canActivate(context('other=1; ps_auth=good'))).toBe(true);
  });

  it('readCookie는 이름이 정확히 같은 쿠키만 읽는다', () => {
    expect(readCookie('a=1; ps_auth=x.y; b=2', 'ps_auth')).toBe('x.y');
    expect(readCookie('ps_auth_old=z', 'ps_auth')).toBeUndefined();
    expect(readCookie(undefined, 'ps_auth')).toBeUndefined();
  });
});
