// 주차 잠김(확정) 여부. 예전 시트 앱과 같은 규칙:
//   수동 설정(manualLock)이 있으면 그 값, 없으면(null) 확정일(화요일) 00:00 KST가 지났는지.
// 저장하지 않고 요청마다 계산하므로, 그 시각에 서버가 꺼져 있어도 틀리지 않는다.
export function lockStartsAt(confirmDate: string): number {
  return Date.parse(`${confirmDate}T00:00:00+09:00`);
}

export function isWeekLocked(
  confirmDate: string,
  manualLock: boolean | null,
  now: Date,
): boolean {
  return manualLock ?? now.getTime() >= lockStartsAt(confirmDate);
}
