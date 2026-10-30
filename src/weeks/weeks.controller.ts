import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put,
} from '@nestjs/common';
import { ParseDatePipe } from '../common/parse-date.pipe';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateContributionDto } from './dto/update-contribution.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { VersionDto } from './dto/version.dto';
import { WeeksService } from './weeks.service';

// DELETE /expenses/:id 도 주차 데이터에 속하므로 이 컨트롤러에서 처리
@Controller()
export class WeeksController {
  constructor(private readonly weeksService: WeeksService) {}

  @Get('weeks/:confirmDate')
  getWeek(@Param('confirmDate', ParseDatePipe) confirmDate: string) {
    return this.weeksService.getWeek(confirmDate);
  }

  @Put('weeks/:confirmDate/sales')
  updateSales(
    @Param('confirmDate', ParseDatePipe) confirmDate: string,
    @Body() dto: UpdateSalesDto,
  ) {
    return this.weeksService.updateSales(confirmDate, dto);
  }

  @Put('weeks/:confirmDate/contributions/:memberId')
  updateContribution(
    @Param('confirmDate', ParseDatePipe) confirmDate: string,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: UpdateContributionDto,
  ) {
    return this.weeksService.updateContribution(confirmDate, memberId, dto);
  }

  @Post('weeks/:confirmDate/confirm')
  @HttpCode(200)
  confirm(
    @Param('confirmDate', ParseDatePipe) confirmDate: string,
    @Body() dto: VersionDto,
  ) {
    return this.weeksService.setConfirmed(confirmDate, true, dto.version);
  }

  @Post('weeks/:confirmDate/unconfirm')
  @HttpCode(200)
  unconfirm(
    @Param('confirmDate', ParseDatePipe) confirmDate: string,
    @Body() dto: VersionDto,
  ) {
    return this.weeksService.setConfirmed(confirmDate, false, dto.version);
  }

  @Post('weeks/:confirmDate/expenses')
  addExpense(
    @Param('confirmDate', ParseDatePipe) confirmDate: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.weeksService.addExpense(confirmDate, dto);
  }

  @Delete('expenses/:id')
  @HttpCode(204)
  deleteExpense(@Param('id', ParseIntPipe) id: number) {
    return this.weeksService.deleteExpense(id);
  }

  @Get('weeks/:confirmDate/settlement')
  getSettlement(@Param('confirmDate', ParseDatePipe) confirmDate: string) {
    return this.weeksService.getSettlement(confirmDate);
  }
}
