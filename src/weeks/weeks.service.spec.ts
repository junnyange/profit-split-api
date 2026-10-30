import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryFailedError, Repository } from 'typeorm';
import { Expense } from '../expenses/expense.entity';
import { Member } from '../members/member.entity';
import { MembersService } from '../members/members.service';
import { SettlementService } from '../settlement/settlement.service';
import { Contribution } from './contribution.entity';
import { Week } from './week.entity';
import { WeeksService } from './weeks.service';

const MEMBERS = [1, 2, 3, 4, 5].map((id) => ({ id, name: `m${id}` }) as Member);

// UPDATE ... WHERE version = ? 결과로 affected 행 수를 돌려주는 QueryBuilder mock
function queryBuilder(affected: number) {
  const qb: Record<'update' | 'set' | 'where' | 'andWhere' | 'execute', jest.Mock> = {
    update: jest.fn(() => qb),
    set: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    execute: jest.fn().mockResolvedValue({ affected }),
  };
  return qb;
}

function setup(
  week: Partial<Week> | null,
  { lock = false, affected = 1 } = {},
) {
  const qb = queryBuilder(affected);
  const weeks = {
    findOne: jest.fn().mockResolvedValue(week),
    findOneBy: jest.fn().mockResolvedValue(week),
    insert: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn(() => qb),
  };
  const contributions = {
    insert: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn(() => qb),
  };
  const membersService = {
    findAll: jest.fn().mockResolvedValue(MEMBERS),
    assertExists: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: () => (lock ? 'true' : undefined) };
  const service = new WeeksService(
    weeks as unknown as Repository<Week>,
    contributions as unknown as Repository<Contribution>,
    {} as Repository<Expense>,
    membersService as unknown as MembersService,
    new SettlementService(),
    config as unknown as ConfigService,
  );
  return { service, weeks, contributions, qb };
}

// 거부된 예외의 응답 body를 꺼낸다
async function conflictBody(p: Promise<unknown>) {
  const e = await p.catch((err: unknown) => err);
  expect(e).toBeInstanceOf(ConflictException);
  return (e as ConflictException).getResponse() as Record<string, unknown>;
}

const WEEK = { id: 7, confirmDate: '2099-01-05', version: 3, confirmed: false, contributions: [], expenses: [] };
const SALES = { salesBefore: 0, salesAfter: 100 };

describe('WeeksService 낙관적 락', () => {
  it('version이 일치하면 WHERE version = ? 로 UPDATE 하고 최신 주차를 돌려준다', async () => {
    const { service, qb } = setup(WEEK);
    const r = await service.updateSales('2099-01-05', { ...SALES, version: 3 });

    expect(qb.set).toHaveBeenCalledWith(SALES);
    expect(qb.andWhere).toHaveBeenCalledWith('version = :version', { version: 3 });
    expect(r.version).toBe(3);
  });

  it('version이 다르면(affected 0) 409 VERSION_CONFLICT + current', async () => {
    const { service } = setup(WEEK, { affected: 0 });
    const body = await conflictBody(
      service.updateSales('2099-01-05', { ...SALES, version: 2 }),
    );

    expect(body.statusCode).toBe(409);
    expect(body.code).toBe('VERSION_CONFLICT');
    expect((body.current as { version: number }).version).toBe(3);
  });

  it('contribution도 같은 방식: 불일치면 409', async () => {
    const { service, qb } = setup(WEEK, { affected: 0 });
    const body = await conflictBody(
      service.updateContribution('2099-01-05', 1, { materialAmount: 5, version: 1 }),
    );

    expect(qb.where).toHaveBeenCalledWith({ weekId: 7, memberId: 1 });
    expect(body.code).toBe('VERSION_CONFLICT');
  });

  it('version 0인데 그사이 다른 요청이 먼저 행을 만들면(unique 충돌) 409', async () => {
    const { service, contributions } = setup(WEEK);
    contributions.insert.mockRejectedValue(
      new QueryFailedError('INSERT', [], Object.assign(new Error(), { code: 'ER_DUP_ENTRY' })),
    );
    const body = await conflictBody(
      service.updateContribution('2099-01-05', 1, { materialAmount: 5, version: 0 }),
    );

    expect(body.code).toBe('VERSION_CONFLICT');
  });

  it('이미 확정된 주를 다시 confirm하면 UPDATE 없이 200 (멱등)', async () => {
    const { service, qb } = setup({ ...WEEK, confirmed: true });
    const r = await service.setConfirmed('2099-01-05', true, 0);

    expect(qb.execute).not.toHaveBeenCalled();
    expect(r.confirmed).toBe(true);
  });
});

describe('WeeksService 확정된 주 쓰기 차단', () => {
  const CONFIRMED = { ...WEEK, confirmed: true };

  it('LOCK_CONFIRMED_WEEKS=true 이면 확정된 주 수정은 409 WEEK_CONFIRMED', async () => {
    const { service, qb } = setup(CONFIRMED, { lock: true });
    const body = await conflictBody(
      service.updateSales('2099-01-05', { ...SALES, version: 3 }),
    );

    expect(body).toEqual({
      statusCode: 409,
      code: 'WEEK_CONFIRMED',
      message: '확정된 주입니다. 확정 해제 후 수정하세요',
    });
    expect(qb.execute).not.toHaveBeenCalled();
  });

  it('차단이 꺼져 있으면(기본값) 확정된 주도 수정된다', async () => {
    const { service, qb } = setup(CONFIRMED);
    await service.updateContribution('2099-01-05', 1, { materialAmount: 5, version: 1 });

    expect(qb.execute).toHaveBeenCalled();
  });

  it('차단이 켜져 있어도 unconfirm은 허용', async () => {
    const { service, qb } = setup(CONFIRMED, { lock: true });
    await service.setConfirmed('2099-01-05', false, 3);

    expect(qb.set).toHaveBeenCalledWith({ confirmed: false, confirmedAt: null });
  });
});

describe('WeeksService.getSettlement', () => {
  it('없는 주는 전부 0, 멤버 5명 20%씩', async () => {
    const { service } = setup(null);
    const r = await service.getSettlement('2099-01-05');

    expect(r.members.map((m) => m.memberId)).toEqual([1, 2, 3, 4, 5]);
    r.members.forEach((m) => {
      expect(m.percent).toBe(20);
      expect(m.share).toBe(0);
      expect(m.materialAmount).toBe(0);
    });
    expect(r.gross).toBe(0);
    expect(r.distributable).toBe(0);
    expect(r.remainder).toBe(0);
  });

  it('입력 없는 멤버는 0으로 채워 계산하고 percent는 소수 둘째 자리', async () => {
    const { service } = setup({
      salesBefore: 1000000,
      salesAfter: 3000000,
      contributions: [
        { memberId: 1, materialAmount: 2298 },
        { memberId: 2, materialAmount: 1702 },
        { memberId: 3, materialAmount: 2000 },
        { memberId: 4, materialAmount: 2000 },
        // 5번은 입력 없음 → 0
      ] as Contribution[],
      expenses: [{ id: 1, item: 'x', amount: 100000, buyerId: null }] as Expense[],
    });
    const r = await service.getSettlement('2099-01-05');

    // 같은 입력을 SettlementService에 직접 넣은 결과와 일치해야 한다
    const expected = new SettlementService().calculate({
      materials: [2298, 1702, 2000, 2000, 0],
      salesBefore: 1000000,
      salesAfter: 3000000,
      expenses: [100000],
    });
    expect(r.members.map((m) => m.share)).toEqual(expected.shares);
    expect(r.members[4].materialAmount).toBe(0);
    r.members.forEach((m, i) =>
      expect(m.percent).toBe(Math.round(expected.percents[i] * 100) / 100),
    );
    expect(r.members[0].percent).toBe(24.36); // 2298/8000*50 + 10 = 24.3625
    expect(r.gross).toBe(2000000);
    expect(r.fee).toBe(100000);
    expect(r.expenseAdjusted).toBe(105000);
    expect(r.distributable).toBe(1795000);
    expect(r.remainder).toBe(expected.remainder);
  });
});
