import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Clock } from '../common/clock';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  // APP_GUARD로 등록하면 앱 전체 요청에 AuthGuard가 적용된다
  providers: [AuthService, Clock, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
