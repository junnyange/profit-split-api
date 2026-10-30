import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { dataSourceOptions } from './data-source';
import { MembersModule } from './members/members.module';
import { WeeksModule } from './weeks/weeks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // TypeORM CLI와 같은 설정 (synchronize: false, 마이그레이션 자동 실행 안 함)
    TypeOrmModule.forRoot(dataSourceOptions),
    AuthModule,
    MembersModule,
    WeeksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
