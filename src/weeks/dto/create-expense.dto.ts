import {
  IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  item: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsInt()
  buyerId?: number | null;
}
