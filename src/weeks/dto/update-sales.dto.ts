import { IsInt, Min } from 'class-validator';

export class UpdateSalesDto {
  @IsInt()
  @Min(0)
  salesBefore: number;

  @IsInt()
  @Min(0)
  salesAfter: number;
}
