import {
  ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ObjectLiteral, QueryDeepPartialEntity, QueryFailedError, Repository,
} from 'typeorm';
import { Clock } from '../common/clock';
import { Expense } from '../expenses/expense.entity';
import { MembersService } from '../members/members.service';
import { SettlementService } from '../settlement/settlement.service';
import { Contribution } from './contribution.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateContributionDto } from './dto/update-contribution.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { isWeekLocked } from './lock';
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
    private readonly clock: Clock,
  ) {
    this.lockConfirmed = config.get('LOCK_CONFIRMED_WEEKS') === 'true';
  }

  private isLocked(confirmDate: string, week: Pick<Week, 'manualLock'> | null): boolean {
    return isWeekLocked(confirmDate, week?.manualLock ?? null, this.clock.now());
  }

  // 조회 전용: 주차가 없어도 만들지 않고 0 / 빈 목록으로 채운다
  async getWeek(confirmDate: string) {
    const [week, members] = await Promise.all([
      this.weeks.findOne({
        where: { confirmDate },
        relations: { contributions: true, expenses: true },
        order: { expenses: { id: 'ASC' } },
      }),
      this.membersService.findAll(),
    ]);
    const rowOf = (memberId: number) =>
      week?.contributions.find((c) => c.memberId === memberId);
    const confirmed = this.isLocked(confirmDate, week);

    return {
      confirmDate,
      version: week?.version ?? 0,
      salesBefore: week?.salesBefore ?? 0,
      salesAfter: week?.salesAfter ?? 0,
      confirmed, // 지금 잠겨 있는지 (수동 설정 또는 자동 규칙)
      manualLock: week?.manualLock ?? null, // null이면 자동
      materialsLocked: this.lockConfirmed && confirmed, // 원자재 입력이 막혀 있는지 (화면이 미리 잠그도록)
      contributions: members.map((m) => ({
        memberId: m.id,
        name: m.name,
        materialAmount: rowOf(m.id)?.materialAmount ?? 0,
        version: rowOf(m.id)?.version ?? 0,
      })),
      expenses: (week?.expenses ?? []).map(
        ({ id, item, category, amount, buyerId }) => ({
          id, item, category, amount, buyerId,
        }),
      ),
    };
  }

  async updateSales(confirmDate: string, dto: UpdateSalesDto) {
    const { version, salesBefore, salesAfter } = dto;
    if (version === 0) {
      await this.insertOrConflict(confirmDate, () =>
        this.weeks.insert({ confirmDate, salesBefore, salesAfter }),
      );
    } else {
      await this.updateWithVersion(this.weeks, confirmDate, { confirmDate }, version, {
        salesBefore, salesAfter,
      });
    }
    return this.getWeek(confirmDate);
  }

  async updateContribution(
    confirmDate: string,
    memberId: number,
    dto: UpdateContributionDto,
  ) {
    const { version, materialAmount } = dto;
    await this.membersService.assertExists(memberId);
    const week = await this.getOrCreateWeek(confirmDate);
    this.assertMaterialsWritable(week);
    if (version === 0) {
      await this.insertOrConflict(confirmDate, () =>
        this.contributions.insert({ weekId: week.id, memberId, materialAmount }),
      );
    } else {
      await this.updateWithVersion(
        this.contributions, confirmDate, { weekId: week.id, memberId }, version,
        { materialAmount },
      );
    }
    return this.getWeek(confirmDate);
  }

  async confirm(confirmDate: string, version: number) {
    const week = await this.weeks.findOneBy({ confirmDate });
    if (!week) throw new NotFoundException(`${confirmDate} 주차가 없습니다`);
    // 이미 잠겨 있으면(수동이든 자동이든) version과 상관없이 지금 상태 그대로 200 (멱등)
    if (!this.isLocked(confirmDate, week)) {
      await this.updateWithVersion(this.weeks, confirmDate, { id: week.id }, version, {
        manualLock: true,
        confirmedAt: this.clock.now(),
      });
    }
    return this.getWeek(confirmDate);
  }

  // 잠금 해제는 접속 코드만 있으면 언제든: version 검사 없이 항상 성공, 이미 풀려 있으면 그대로 200.
  // 자동으로 잠긴 주도 manualLock=false로 저장해서 다시 잠기지 않게 한다.
  async unconfirm(confirmDate: string) {
    const existing = await this.weeks.findOneBy({ confirmDate });
    if (this.isLocked(confirmDate, existing)) {
      const week = existing ?? (await this.getOrCreateWeek(confirmDate)); // 행이 없는 지난 주 (자동 잠김)
      await this.weeks.update(week.id, { manualLock: false, confirmedAt: null });
    }
    return this.getWeek(confirmDate);
  }

  async addExpense(confirmDate: string, dto: CreateExpenseDto) {
    if (dto.buyerId != null) {
      await this.membersService.assertExists(dto.buyerId);
    }
    const week = await this.getOrCreateWeek(confirmDate);
    const { id, item, category, amount, buyerId } = await this.expenses.save(
      this.expenses.create({
        weekId: week.id,
        item: dto.item,
        category: dto.category ?? null,
        amount: dto.amount,
        buyerId: dto.buyerId ?? null,
      }),
    );
    return { id, item, category, amount, buyerId };
  }

  // 잠긴 주에서도 지출 추가/삭제, 판매 금액 수정은 허용 (막는 것은 원자재뿐)
  async deleteExpense(id: number): Promise<void> {
    const result = await this.expenses.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`지출 ${id}이(가) 없습니다`);
    }
  }

  // 정산 결과는 저장하지 않고 매번 계산한다
  async getSettlement(confirmDate: string) {
    const week = await this.getWeek(confirmDate);
    const { percents, shares, ...totals } = this.settlementService.calculate({
      materials: week.contributions.map((c) => c.materialAmount),
      salesBefore: week.salesBefore,
      salesAfter: week.salesAfter,
      expenses: week.expenses.map((e) => e.amount),
    });

    return {
      confirmDate,
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

  // 동시에 같은 주를 처음 만들면 한쪽은 confirmDate unique에 걸린다 → 다시 조회해서 먼저 만들어진 걸 쓴다
  private async getOrCreateWeek(confirmDate: string): Promise<Week> {
    const found = await this.weeks.findOneBy({ confirmDate });
    if (found) return found;
    try {
      return await this.weeks.save(this.weeks.create({ confirmDate }));
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      return this.weeks.findOneByOrFail({ confirmDate });
    }
  }

  // TypeORM save()는 @VersionColumn이 있어도 UPDATE의 WHERE에 기본키만 넣고 version은 +1만 한다
  // (SubjectExecutor → whereEntity(identifier)). 그래서 "읽고 → 비교 → save()"는 그 사이에 끼어든 요청을 덮어쓴다.
  // 대신 UPDATE ... SET ..., version = version + 1 WHERE ... AND version = ? 한 문장으로 비교와 저장을 동시에 한다.
  // (QueryBuilder update는 version = version + 1을 자동으로 붙인다)
  private async updateWithVersion<T extends ObjectLiteral>(
    repo: Repository<T>,
    confirmDate: string,
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
    if (!affected) throw await this.versionConflict(confirmDate);
  }

  // version 0 = "행이 없다고 알고 있음". 그사이 누가 먼저 만들었으면 unique 충돌 → 409
  private async insertOrConflict(
    confirmDate: string,
    insert: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await insert();
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      throw await this.versionConflict(confirmDate);
    }
  }

  private async versionConflict(confirmDate: string) {
    return new ConflictException({
      statusCode: 409,
      code: 'VERSION_CONFLICT',
      message: '다른 사람이 먼저 수정했습니다. 최신 값을 확인하세요',
      current: await this.getWeek(confirmDate),
    });
  }

  // shortcut: 확정 여부를 읽은 뒤 쓰므로, confirm과 거의 동시에 들어온 수정 1건은 통과할 수 있다.
  // 문제가 되면 트랜잭션 + week 행 SELECT ... FOR UPDATE로 바꿀 것.
  private assertMaterialsWritable(week: Week): void {
    if (this.lockConfirmed && this.isLocked(week.confirmDate, week)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'WEEK_CONFIRMED',
        message: '확정된 주라 원자재 생산 금액은 바꿀 수 없어요. 확정 해제 후 수정하세요',
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
