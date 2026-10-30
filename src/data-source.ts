import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';

// TypeORM CLI는 Nest(ConfigModule) 없이 이 파일만 읽으므로 .env를 직접 불러온다.
// 이미 설정된 환경변수는 덮어쓰지 않는다 (예: DB_DATABASE=다른DB npm run migration:run).
if (existsSync('.env')) process.loadEnvFile();

// CLI(ts-node)에서는 src/*.ts, 빌드된 앱에서는 dist/*.js. dist의 .d.ts까지 읽지 않도록 확장자를 고정한다.
const ext = extname(__filename);

// 앱(AppModule)과 CLI가 같은 설정을 쓴다
export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [`${__dirname}/**/*.entity${ext}`],
  migrations: [`${__dirname}/migrations/*${ext}`],
  // 스키마는 마이그레이션으로만 바꾼다. 앱 시작 시 자동 실행 여부는 배포 단계에서 결정.
  synchronize: false,
  migrationsRun: false,
  timezone: '+09:00',
  logging: ['error', 'schema'],
};

export default new DataSource(dataSourceOptions);
