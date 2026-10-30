import { SettlementService } from './settlement.service';

describe('SettlementService', () => {
  const service = new SettlementService();

  it('분배율 = 원자재 비율 ÷ 2 + 10% (22.98% → 21.49%)', () => {
    const r = service.calculate({
      materials: [2298, 1702, 2000, 2000, 2000],
      salesBefore: 0, salesAfter: 0, expenses: [],
    });
    expect(r.percents[0]).toBeCloseTo(21.49, 2);
    expect(r.percents[1]).toBeCloseTo(18.51, 2);
    expect(r.percents[2]).toBeCloseTo(20, 2);
    const total = r.percents.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it('원자재가 모두 0이면 20%씩 똑같이 나눈다', () => {
    const r = service.calculate({
      materials: [0, 0, 0, 0, 0],
      salesBefore: 0, salesAfter: 1000000, expenses: [],
    });
    r.percents.forEach((p) => expect(p).toBeCloseTo(20, 6));
    expect(r.shares).toEqual([190000, 190000, 190000, 190000, 190000]);
  });

  it('수수료 5%와 지출 ×105%를 빼고 나눈다', () => {
    const r = service.calculate({
      materials: [1, 1, 1, 1, 1],
      salesBefore: 1000000, salesAfter: 3000000, expenses: [100000],
    });
    expect(r.gross).toBe(2000000);
    expect(r.fee).toBeCloseTo(100000, 6);
    expect(r.net).toBeCloseTo(1900000, 6);
    expect(r.expenseAdjusted).toBeCloseTo(105000, 6);
    expect(r.distributable).toBeCloseTo(1795000, 6);
    expect(r.shares).toEqual([359000, 359000, 359000, 359000, 359000]);
    expect(r.remainder).toBe(0);
  });

  it('원 단위 아래는 버리고, 남는 금액을 따로 계산한다', () => {
    const r = service.calculate({
      materials: [2298, 1702, 2000, 2000, 2000],
      salesBefore: 1000000, salesAfter: 2234567, expenses: [12345, 6789],
    });
    expect(r.distributable).toBeCloseTo(1152747.95, 2);
    expect(r.shares).toEqual([247725, 213373, 230549, 230549, 230549]);
    expect(r.remainder).toBe(3);
  });

  it('분배할 금액이 0 이하면 아무도 받지 않는다', () => {
    const r = service.calculate({
      materials: [1, 1, 1, 1, 1],
      salesBefore: 0, salesAfter: 100000, expenses: [200000],
    });
    expect(r.distributable).toBeCloseTo(-115000, 6);
    expect(r.shares).toEqual([0, 0, 0, 0, 0]);
    expect(r.remainder).toBe(0);
  });
});
