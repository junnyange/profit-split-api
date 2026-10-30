import { IsInt, Min } from 'class-validator';
import { VersionDto } from './version.dto';

export class UpdateContributionDto extends VersionDto {
  @IsInt()
  @Min(0)
  materialAmount: number;
}
