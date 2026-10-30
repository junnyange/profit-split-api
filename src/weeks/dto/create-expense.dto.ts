import {
  IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../expenses/expense.entity';

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

  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: ExpenseCategory | null;
}
