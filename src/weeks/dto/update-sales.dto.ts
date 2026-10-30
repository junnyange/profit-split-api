import { IsInt, Min } from 'class-validator';
import { VersionDto } from './version.dto';

export class UpdateSalesDto extends VersionDto {
  @IsInt()
  @Min(0)
  salesBefore: number;

  @IsInt()
  @Min(0)
  salesAfter: number;
}
