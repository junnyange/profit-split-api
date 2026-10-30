import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';

// 빌드된 화면 (dist/main.js 기준 ../web/dist). 개발 중(Vite)에는 없을 수 있다
const WEB_DIST = join(__dirname, '..', 'web', 'dist');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 리버스 프록시(Caddy) 뒤에서는 req.ip가 프록시 IP가 되어 모든 사용자가 같은 IP로 보인다.
  // 그러면 한 명이 접속 코드를 5번 틀릴 때 전원이 15분 막힌다.
  // 1 = 바로 앞의 프록시 한 단계만 믿고, 그 프록시가 붙인 X-Forwarded-For의 마지막 값을 사용자 IP로 쓴다.
  // 프록시 없이 직접 열린 서버에서 켜면 누구나 X-Forwarded-For를 지어내 IP 잠금을 피할 수 있어서 기본은 끈다.
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

  // 배포 때 같은 서버에서 화면(/)과 API(/api/...)를 함께 서비스하려고 API에 prefix를 붙인다
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 화면: 정적 파일은 그대로, /api가 아닌 나머지 GET은 index.html (화면 안 주소 새로고침 대응).
  // Express 미들웨어라 Nest 가드보다 먼저 처리된다 → 접속 코드 화면 자체는 쿠키 없이 받을 수 있다.
  if (existsSync(WEB_DIST)) {
    app.useStaticAssets(WEB_DIST, { index: false });
    app.use((req: Request, res: Response, next: NextFunction) => {
      const isApi = req.path === '/api' || req.path.startsWith('/api/');
      if (req.method !== 'GET' || isApi) return next();
      res.setHeader('Cache-Control', 'no-cache'); // 새 배포 후 옛 화면이 남지 않게
      res.sendFile(join(WEB_DIST, 'index.html'));
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
