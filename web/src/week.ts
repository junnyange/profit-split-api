// 날짜와 금액 표시 도우미 (React와 무관한 순수 함수)

const DAY = 86_400_000;
const KST_OFFSET = 9 * 3_600_000;
const TUESDAY = 2;

const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// 주차 키 = 그 주의 확정일(화요일). 확정일 00시(KST)가 되면 그 주는 확정되므로,
// "이번 주"는 오늘(KST) 이후 첫 화요일이다. 화요일 당일이면 다음 주 화요일.
export function thisWeekKey(now = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET); // UTC getter로 KST 날짜를 읽는다
  const today = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  const days = (TUESDAY - kst.getUTCDay() + 7) % 7 || 7;
  return toKey(today + days * DAY);
}

export function shiftWeeks(key: string, weeks: number): string {
  return toKey(Date.parse(`${key}T00:00:00Z`) + weeks * 7 * DAY);
}

export function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && toKey(Date.parse(s)) === s;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const weekdayOf = (key: string) => WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()];

// 화면 표시용: 원 단위 반올림 + 쉼표 (계산은 서버가 한다)
export const formatWon = (n: number) => Math.round(n).toLocaleString('ko-KR');
