import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put,
} from '@nestjs/common';
import { ParseDatePipe } from '../common/parse-date.pipe';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateContributionDto } from './dto/update-contribution.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { WeeksService } from './weeks.service';

// DELETE /expenses/:id 도 주차 데이터에 속하므로 이 컨트롤러에서 처리
@Controller()
export class WeeksController {
  constructor(private readonly weeksService: WeeksService) {}

  @Get('weeks/:startDate')
  getWeek(@Param('startDate', ParseDatePipe) startDate: string) {
    return this.weeksService.getWeek(startDate);
  }

  @Put('weeks/:startDate/sales')
  updateSales(
    @Param('startDate', ParseDatePipe) startDate: string,
    @Body() dto: UpdateSalesDto,
  ) {
    return this.weeksService.updateSales(startDate, dto);
  }

  @Put('weeks/:startDate/contributions/:memberId')
  updateContribution(
    @Param('startDate', ParseDatePipe) startDate: string,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: UpdateContributionDto,
  ) {
    return this.weeksService.updateContribution(startDate, memberId, dto);
  }

  @Post('weeks/:startDate/expenses')
  addExpense(
    @Param('startDate', ParseDatePipe) startDate: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.weeksService.addExpense(startDate, dto);
  }

  @Delete('expenses/:id')
  @HttpCode(204)
  deleteExpense(@Param('id', ParseIntPipe) id: number) {
    return this.weeksService.deleteExpense(id);
  }

  @Get('weeks/:startDate/settlement')
  getSettlement(@Param('startDate', ParseDatePipe) startDate: string) {
    return this.weeksService.getSettlement(startDate);
  }
}
