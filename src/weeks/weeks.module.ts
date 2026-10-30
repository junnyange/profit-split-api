import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clock } from '../common/clock';
import { Expense } from '../expenses/expense.entity';
import { MembersModule } from '../members/members.module';
import { SettlementService } from '../settlement/settlement.service';
import { Contribution } from './contribution.entity';
import { Week } from './week.entity';
import { WeeksController } from './weeks.controller';
import { WeeksService } from './weeks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Week, Contribution, Expense]),
    MembersModule,
  ],
  controllers: [WeeksController],
  providers: [WeeksService, SettlementService, Clock],
})
export class WeeksModule {}
