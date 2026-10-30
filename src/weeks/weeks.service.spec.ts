import { Repository } from 'typeorm';
import { Expense } from '../expenses/expense.entity';
import { Member } from '../members/member.entity';
import { MembersService } from '../members/members.service';
import { SettlementService } from '../settlement/settlement.service';
import { Contribution } from './contribution.entity';
import { Week } from './week.entity';
import { WeeksService } from './weeks.service';

const MEMBERS = [1, 2, 3, 4, 5].map((id) => ({ id, name: `m${id}` }) as Member);

function setup(week: Partial<Week> | null) {
  const weeks = { findOne: jest.fn().mockResolvedValue(week) };
  const membersService = { findAll: jest.fn().mockResolvedValue(MEMBERS) };
  const service = new WeeksService(
    weeks as unknown as Repository<Week>,
    {} as Repository<Contribution>,
    {} as Repository<Expense>,
    membersService as unknown as MembersService,
    new SettlementService(),
  );
  return { service, weeks };
}

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
