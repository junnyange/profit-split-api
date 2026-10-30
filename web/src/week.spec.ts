// 루트에서 npm test로 실행된다 (jest가 *.spec.ts를 찾음). DOM/React를 쓰지 않는 함수만 검사
import { formatWon, isDateKey, shiftWeeks, thisWeekKey } from './week';

describe('thisWeekKey: 오늘(KST) 이후 첫 화요일', () => {
  it('금요일 → 다음 화요일', () => {
    expect(thisWeekKey(new Date('2026-10-30T12:00:00+09:00'))).toBe('2026-11-03');
  });

  it('월요일 23:59 KST → 다음 날(화)', () => {
    expect(thisWeekKey(new Date('2026-11-02T23:59:00+09:00'))).toBe('2026-11-03');
  });

  it('화요일 00:00 KST가 되면 그 주는 확정 → 일주일 뒤 화요일', () => {
    expect(thisWeekKey(new Date('2026-11-03T00:00:00+09:00'))).toBe('2026-11-10');
  });

  it('UTC로는 아직 월요일이어도 KST 기준으로 계산 (UTC 2026-11-02 15:00 = KST 화 00:00)', () => {
    expect(thisWeekKey(new Date('2026-11-02T15:00:00Z'))).toBe('2026-11-10');
  });
});

describe('기타', () => {
  it('shiftWeeks는 7일씩 이동 (월/연 경계 포함)', () => {
    expect(shiftWeeks('2026-10-27', 1)).toBe('2026-11-03');
    expect(shiftWeeks('2026-12-29', 1)).toBe('2027-01-05');
    expect(shiftWeeks('2026-11-03', -1)).toBe('2026-10-27');
  });

  it('isDateKey는 없는 날짜를 거른다', () => {
    expect(isDateKey('2099-01-05')).toBe(true);
    expect(isDateKey('2099-02-30')).toBe(false);
    expect(isDateKey('abc')).toBe(false);
  });

  it('formatWon은 반올림 후 쉼표', () => {
    expect(formatWon(168650693.2)).toBe('168,650,693');
    expect(formatWon(-965685)).toBe('-965,685');
  });
});
