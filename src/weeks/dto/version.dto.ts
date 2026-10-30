import { IsInt, Min } from 'class-validator';

// 클라이언트가 마지막으로 본 version. 0 = "아직 행이 없다고 알고 있음"
export class VersionDto {
  @IsInt()
  @Min(0)
  version: number;
}
