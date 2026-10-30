import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// 개발 중에는 /api 요청을 Nest 서버로 넘긴다 (같은 출처처럼 보여서 CORS 설정이 필요 없음)
// 다른 포트의 API를 쓰려면: API_TARGET=http://localhost:3001 npm run dev
export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, '.', '').API_TARGET || 'http://localhost:3000';
  const proxy = { '/api': target };
  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  };
});
