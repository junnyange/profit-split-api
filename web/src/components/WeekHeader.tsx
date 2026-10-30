import { shiftWeeks, thisWeekKey, weekdayOf } from '../week';

interface Props {
  confirmDate: string;
  onChange: (confirmDate: string) => void;
  confirmed: boolean;
  canConfirm: boolean; // 저장된 내용이 있는 주만 확정 가능 (없으면 서버가 404)
  onConfirm: () => void;
  onUnconfirm: () => void;
}

// 주차 이동(이전/이번/다음 주)과 확정 상태, 확정/확정 해제 버튼
export function WeekHeader({ confirmDate, onChange, confirmed, canConfirm, onConfirm, onUnconfirm }: Props) {
  const isThisWeek = confirmDate === thisWeekKey();
  return (
    <header className="card">
      <div className="week-nav">
        <button onClick={() => onChange(shiftWeeks(confirmDate, -1))} aria-label="이전 주">◀</button>
        <div className="week-title">
          <strong>
            {confirmDate} ({weekdayOf(confirmDate)})
          </strong>
          <small>확정일 기준 주차{isThisWeek && ' · 이번 주'}</small>
        </div>
        <button onClick={() => onChange(shiftWeeks(confirmDate, 1))} aria-label="다음 주">▶</button>
      </div>
      <div className="week-actions">
        <button onClick={() => onChange(thisWeekKey())} disabled={isThisWeek}>
          이번 주
        </button>
        <span className={confirmed ? 'badge done' : 'badge'}>{confirmed ? '확정' : '수정 가능'}</span>
        {confirmed ? (
          <button onClick={onUnconfirm}>확정 해제</button>
        ) : (
          <button className="primary" onClick={onConfirm} disabled={!canConfirm} title={canConfirm ? '' : '입력된 내용이 있어야 확정할 수 있어요'}>
            확정
          </button>
        )}
      </div>
    </header>
  );
}
