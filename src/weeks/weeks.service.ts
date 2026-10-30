import {
  ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ObjectLiteral, QueryDeepPartialEntity, QueryFailedError, Repository,
} from 'typeorm';
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
  private readonly lockConfirmed: boolean;

  constructor(
    @InjectRepository(Week) private readonly weeks: Repository<Week>,
    @InjectRepository(Contribution)
    private readonly contributions: Repository<Contribution>,
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    private readonly membersService: MembersService,
    private readonly settlementService: SettlementService,
    config: ConfigService,
  ) {
    this.lockConfirmed = config.get('LOCK_CONFIRMED_WEEKS') === 'true';
  }

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
    const rowOf = (memberId: number) =>
      week?.contributions.find((c) => c.memberId === memberId);

    return {
      startDate,
      version: week?.version ?? 0,
      salesBefore: week?.salesBefore ?? 0,
      salesAfter: week?.salesAfter ?? 0,
      confirmed: week?.confirmed ?? false,
      contributions: members.map((m) => ({
        memberId: m.id,
        name: m.name,
        materialAmount: rowOf(m.id)?.materialAmount ?? 0,
        version: rowOf(m.id)?.version ?? 0,
      })),
      expenses: (week?.expenses ?? []).map(({ id, item, amount, buyerId }) => ({
        id, item, amount, buyerId,
      })),
    };
  }

  async updateSales(startDate: string, dto: UpdateSalesDto) {
    const { version, salesBefore, salesAfter } = dto;
    this.assertWritable(await this.weeks.findOneBy({ startDate }));
    if (version === 0) {
      await this.insertOrConflict(startDate, () =>
        this.weeks.insert({ startDate, salesBefore, salesAfter }),
      );
    } else {
      await this.updateWithVersion(this.weeks, startDate, { startDate }, version, {
        salesBefore, salesAfter,
      });
    }
    return this.getWeek(startDate);
  }

  async updateContribution(
    startDate: string,
    memberId: number,
    dto: UpdateContributionDto,
  ) {
    const { version, materialAmount } = dto;
    await this.membersService.assertExists(memberId);
    const week = await this.getOrCreateWeek(startDate);
    this.assertWritable(week);
    if (version === 0) {
      await this.insertOrConflict(startDate, () =>
        this.contributions.insert({ weekId: week.id, memberId, materialAmount }),
      );
    } else {
      await this.updateWithVersion(
        this.contributions, startDate, { weekId: week.id, memberId }, version,
        { materialAmount },
      );
    }
    return this.getWeek(startDate);
  }

  async setConfirmed(startDate: string, confirmed: boolean, version: number) {
    const week = await this.weeks.findOneBy({ startDate });
    if (!week) throw new NotFoundException(`${startDate} 주차가 없습니다`);
    // 이미 원하는 상태면 version과 상관없이 지금 상태 그대로 200 (멱등)
    if (week.confirmed !== confirmed) {
      await this.updateWithVersion(this.weeks, startDate, { id: week.id }, version, {
        confirmed,
        confirmedAt: confirmed ? new Date() : null,
      });
    }
    return this.getWeek(startDate);
  }

  async addExpense(startDate: string, dto: CreateExpenseDto) {
    if (dto.buyerId != null) {
      await this.membersService.assertExists(dto.buyerId);
    }
    const week = await this.getOrCreateWeek(startDate);
    this.assertWritable(week);
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
    const expense = await this.expenses.findOne({
      where: { id },
      relations: { week: true },
    });
    if (!expense) throw new NotFoundException(`지출 ${id}이(가) 없습니다`);
    this.assertWritable(expense.week);
    await this.expenses.delete(id);
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

  // TypeORM save()는 @VersionColumn이 있어도 UPDATE의 WHERE에 기본키만 넣고 version은 +1만 한다
  // (SubjectExecutor → whereEntity(identifier)). 그래서 "읽고 → 비교 → save()"는 그 사이에 끼어든 요청을 덮어쓴다.
  // 대신 UPDATE ... SET ..., version = version + 1 WHERE ... AND version = ? 한 문장으로 비교와 저장을 동시에 한다.
  // (QueryBuilder update는 version = version + 1을 자동으로 붙인다)
  private async updateWithVersion<T extends ObjectLiteral>(
    repo: Repository<T>,
    startDate: string,
    where: ObjectLiteral,
    version: number,
    set: QueryDeepPartialEntity<T>,
  ): Promise<void> {
    const { affected } = await repo
      .createQueryBuilder()
      .update()
      .set(set)
      .where(where)
      .andWhere('version = :version', { version })
      .execute();
    if (!affected) throw await this.versionConflict(startDate);
  }

  // version 0 = "행이 없다고 알고 있음". 그사이 누가 먼저 만들었으면 unique 충돌 → 409
  private async insertOrConflict(
    startDate: string,
    insert: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await insert();
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      throw await this.versionConflict(startDate);
    }
  }

  private async versionConflict(startDate: string) {
    return new ConflictException({
      statusCode: 409,
      code: 'VERSION_CONFLICT',
      message: '다른 사람이 먼저 수정했습니다. 최신 값을 확인하세요',
      current: await this.getWeek(startDate),
    });
  }

  // shortcut: 확정 여부를 읽은 뒤 쓰므로, confirm과 거의 동시에 들어온 수정 1건은 통과할 수 있다.
  // 문제가 되면 트랜잭션 + week 행 SELECT ... FOR UPDATE로 바꿀 것.
  private assertWritable(week: Week | null): void {
    if (this.lockConfirmed && week?.confirmed) {
      throw new ConflictException({
        statusCode: 409,
        code: 'WEEK_CONFIRMED',
        message: '확정된 주입니다. 확정 해제 후 수정하세요',
      });
    }
  }
}

function isDuplicateKey(e: unknown): boolean {
  return (
    e instanceof QueryFailedError &&
    (e.driverError as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}
