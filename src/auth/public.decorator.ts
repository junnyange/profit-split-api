import { SetMetadata } from '@nestjs/common';

// 접속 코드 없이 호출할 수 있는 컨트롤러/핸들러 (health, auth)
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
