export interface Notice {
  kind: 'conflict' | 'locked' | 'error';
  text: string;
  mine?: string; // 사용자가 입력했지만 저장되지 않은 값 (사라지지 않게 보여줌)
}

// 화면 위쪽에 고정되는 안내 (409, 400, 404, 네트워크 오류)
export function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <div className={`notice ${notice.kind}`} role="alert">
      <div>
        <p>{notice.text}</p>
        {notice.mine && <p className="mine">내가 입력한 값: {notice.mine}</p>}
      </div>
      <button onClick={onClose} aria-label="안내 닫기">
        ✕
      </button>
    </div>
  );
}
