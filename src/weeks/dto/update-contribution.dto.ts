import { IsInt, Min } from 'class-validator';

export class UpdateContributionDto {
  @IsInt()
  @Min(0)
  materialAmount: number;
}
