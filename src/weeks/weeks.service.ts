import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Expense } from '../expenses/expense.entity';
import { MembersService } from '../members/members.service';
import { SettlementService } from '../settlement/settlement.service';
import { Contribution } from './contribution.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateContributionDto } from './dto/update-contribution.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { Week } from './week.entity';

@Injectable()
export class WeeksService {
  constructor(
    @InjectRepository(Week) private readonly weeks: Repository<Week>,
    @InjectRepository(Contribution)
    private readonly contributions: Repository<Contribution>,
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    private readonly membersService: MembersService,
    private readonly settlementService: SettlementService,
  ) {}

  // 조회 전용: 주차가 없어도 만들지 않고 0 / 빈 목록으로 채운다
  async getWeek(startDate: string) {
    const [week, members] = await Promise.all([
      this.weeks.findOne({
        where: { startDate },
        relations: { contributions: true, expenses: true },
        order: { expenses: { id: 'ASC' } },
      }),
      this.membersService.findAll(),
    ]);
    const amountOf = (memberId: number) =>
      week?.contributions.find((c) => c.memberId === memberId)
        ?.materialAmount ?? 0;

    return {
      startDate,
      salesBefore: week?.salesBefore ?? 0,
      salesAfter: week?.salesAfter ?? 0,
      confirmed: week?.confirmed ?? false,
      contributions: members.map((m) => ({
        memberId: m.id,
        name: m.name,
        materialAmount: amountOf(m.id),
      })),
      expenses: (week?.expenses ?? []).map(({ id, item, amount, buyerId }) => ({
        id, item, amount, buyerId,
      })),
    };
  }

  async updateSales(startDate: string, dto: UpdateSalesDto) {
    const week = await this.getOrCreateWeek(startDate);
    week.salesBefore = dto.salesBefore;
    week.salesAfter = dto.salesAfter;
    await this.weeks.save(week);
    return this.getWeek(startDate);
  }

  async updateContribution(
    startDate: string,
    memberId: number,
    dto: UpdateContributionDto,
  ) {
    await this.membersService.assertExists(memberId);
    const week = await this.getOrCreateWeek(startDate);
    await this.saveContribution(week.id, memberId, dto.materialAmount);
    return this.getWeek(startDate);
  }

  async addExpense(startDate: string, dto: CreateExpenseDto) {
    if (dto.buyerId != null) {
      await this.membersService.assertExists(dto.buyerId);
    }
    const week = await this.getOrCreateWeek(startDate);
    const { id, item, amount, buyerId } = await this.expenses.save(
      this.expenses.create({
        weekId: week.id,
        item: dto.item,
        amount: dto.amount,
        buyerId: dto.buyerId ?? null,
      }),
    );
    return { id, item, amount, buyerId };
  }

  async deleteExpense(id: number): Promise<void> {
    const result = await this.expenses.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`지출 ${id}이(가) 없습니다`);
    }
  }

  // 정산 결과는 저장하지 않고 매번 계산한다
  async getSettlement(startDate: string) {
    const week = await this.getWeek(startDate);
    const { percents, shares, ...totals } = this.settlementService.calculate({
      materials: week.contributions.map((c) => c.materialAmount),
      salesBefore: week.salesBefore,
      salesAfter: week.salesAfter,
      expenses: week.expenses.map((e) => e.amount),
    });

    return {
      startDate,
      members: week.contributions.map((c, i) => ({
        memberId: c.memberId,
        name: c.name,
        materialAmount: c.materialAmount,
        percent: Math.round(percents[i] * 100) / 100,
        share: shares[i],
      })),
      ...totals,
    };
  }

  // 동시에 같은 주를 처음 만들면 한쪽은 startDate unique에 걸린다 → 다시 조회해서 먼저 만들어진 걸 쓴다
  private async getOrCreateWeek(startDate: string): Promise<Week> {
    const found = await this.weeks.findOneBy({ startDate });
    if (found) return found;
    try {
      return await this.weeks.save(this.weeks.create({ startDate }));
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      return this.weeks.findOneByOrFail({ startDate });
    }
  }

  // (weekId, memberId) unique도 같은 방식: 새로 넣다 충돌하면 한 번 더 시도(이번엔 기존 행을 수정)
  private async saveContribution(
    weekId: number,
    memberId: number,
    materialAmount: number,
  ): Promise<void> {
    const existing = await this.contributions.findOneBy({ weekId, memberId });
    const row = existing ?? this.contributions.create({ weekId, memberId });
    row.materialAmount = materialAmount;
    try {
      await this.contributions.save(row);
    } catch (e) {
      if (existing || !isDuplicateKey(e)) throw e;
      await this.saveContribution(weekId, memberId, materialAmount);
    }
  }
}

function isDuplicateKey(e: unknown): boolean {
  return (
    e instanceof QueryFailedError &&
    (e.driverError as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}
