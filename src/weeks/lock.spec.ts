import { isWeekLocked } from './lock';

describe('isWeekLocked', () => {
  const TUE = '2026-11-03';

  it('자동: 월요일 23:59:59 KST에는 안 잠김, 화요일 00:00 KST부터 잠김', () => {
    expect(isWeekLocked(TUE, null, new Date('2026-11-02T23:59:59.999+09:00'))).toBe(false);
    expect(isWeekLocked(TUE, null, new Date('2026-11-03T00:00:00+09:00'))).toBe(true);
  });

  it('KST 기준: UTC 2026-11-02 15:00 = KST 화요일 00:00 → 잠김', () => {
    expect(isWeekLocked(TUE, null, new Date('2026-11-02T14:59:59Z'))).toBe(false);
    expect(isWeekLocked(TUE, null, new Date('2026-11-02T15:00:00Z'))).toBe(true);
  });

  it('수동 설정이 있으면 날짜와 상관없이 그 값', () => {
    expect(isWeekLocked(TUE, true, new Date('2026-10-01T00:00:00+09:00'))).toBe(true);
    // 자동으로 잠긴 주를 누가 풀면(false) 다시 잠기지 않는다
    expect(isWeekLocked(TUE, false, new Date('2027-01-01T00:00:00+09:00'))).toBe(false);
  });
});
