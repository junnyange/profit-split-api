import { isAutoConfirmed, mapWeekRow, parseCsv, parseNumber, SheetDataError } from './sheet';

const NOW = new Date('2026-10-30T12:00:00+09:00');

function row(overrides: Record<string, unknown> = {}, expense: Record<string, unknown> = {}) {
  return JSON.stringify({
    material: [1, 2, 3, 4, 5],
    before: 10,
    after: 20,
    expenses: [{ id: 'a', cat: '가계부', buyer: 0, memo: '유리', amount: 100, paid: true, ...expense }],
    manualLock: null,
    ...overrides,
  });
}

function errorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(SheetDataError);
    return (e as Error).message;
  }
  throw new Error('예외가 나지 않음');
}

describe('parseCsv / parseNumber', () => {
  it('따옴표 안의 쉼표와 "" 를 처리한다', () => {
    expect(parseCsv('a,b\r\n"x,""y""",2\n')).toEqual([['a', 'b'], ['x,"y"', '2']]);
  });

  it('쉼표, %, 음수를 숫자로 바꾼다', () => {
    expect(parseNumber('-965,685')).toBe(-965685);
    expect(parseNumber('21.18%')).toBe(21.18);
    expect(() => parseNumber('abc')).toThrow(SheetDataError);
  });
});

describe('mapWeekRow', () => {
  it('week가 아닌 key는 건너뛴다(null)', () => {
    expect(mapWeekRow('settings', '{}', NOW)).toBeNull();
  });

  it('buyer 인덱스 → id, 빈 값 → null, memo → item, paid → distributed', () => {
    const w = mapWeekRow('week:2026-11-03', row({}, { buyer: '' }), NOW)!;
    expect(w.expenses[0]).toEqual({ item: '유리', category: '가계부', amount: 100, buyerId: null, distributed: true });
    expect(mapWeekRow('week:2026-11-03', row({}, { buyer: 4 }), NOW)!.expenses[0].buyerId).toBe(5);
  });

  it('manualLock이 있으면 그 값, null이면 확정일 00시 KST 기준으로 계산', () => {
    expect(mapWeekRow('week:2026-11-03', row({ manualLock: true }), NOW)).toMatchObject({ confirmed: true, confirmedBy: 'manual' });
    expect(mapWeekRow('week:2026-11-03', row(), NOW)).toMatchObject({ confirmed: false, confirmedBy: 'auto' });
    expect(mapWeekRow('week:2026-10-27', row(), NOW)).toMatchObject({ confirmed: true, confirmedBy: 'auto' });
    expect(isAutoConfirmed('2026-10-31', new Date('2026-10-30T15:00:00Z'))).toBe(true); // = 10-31 00:00 KST
  });

  it('이상한 값은 건너뛰지 않고 어느 주의 어떤 값인지 알려주며 멈춘다', () => {
    expect(errorOf(() => mapWeekRow('week:2026-10-20', row({ material: [1, -2, 3, 4, 5] }), NOW)))
      .toContain('week:2026-10-20 material[1] = -2');
    expect(errorOf(() => mapWeekRow('week:2026-10-20', row({}, { amount: '1,000' }), NOW)))
      .toContain('expenses[0].amount = "1,000"');
    expect(errorOf(() => mapWeekRow('week:2026-10-20', row({}, { buyer: 5 }), NOW)))
      .toContain('expenses[0].buyer = 5');
    expect(errorOf(() => mapWeekRow('week:2026-10-20', row({}, { cat: '기타' }), NOW)))
      .toContain('expenses[0].cat');
    expect(errorOf(() => mapWeekRow('week:2026-02-30', row(), NOW))).toContain('key');
  });
});
