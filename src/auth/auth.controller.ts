import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AUTH_COOKIE, AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { Public } from './public.decorator';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // 맞으면 서명된 httpOnly 쿠키 발급 (JS에서 읽을 수 없음, 30일)
  @Post('login')
  @HttpCode(204)
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    // 프록시 뒤에서는 TRUST_PROXY=true여야 req.ip가 실제 사용자 IP가 된다 (main.ts)
    const token = this.auth.login(dto.code, req.ip ?? 'unknown');
    res.cookie(AUTH_COOKIE, token, this.auth.cookieOptions());
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    const { maxAge: _, ...options } = this.auth.cookieOptions();
    res.clearCookie(AUTH_COOKIE, options);
  }
}
