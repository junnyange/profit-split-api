import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Settlement, type Week } from './api';
import { ExpenseSection } from './components/ExpenseSection';
import { LoginScreen } from './components/LoginScreen';
import { MoneyInput } from './components/MoneyInput';
import { type Notice, NoticeBar } from './components/NoticeBar';
import { SettlementSection } from './components/SettlementSection';
import { WeekHeader } from './components/WeekHeader';
import { formatWon, isDateKey, thisWeekKey } from './week';

// 주소 뒤 #2026-11-03 으로 주차를 고정할 수 있다 (새로고침, 다른 탭에서 같은 주 열기)
const initialWeek = () => {
  const hash = location.hash.slice(1);
  return isDateKey(hash) ? hash : thisWeekKey();
};

export function App() {
  const [confirmDate, setConfirmDate] = useState(initialWeek);
  const [week, setWeek] = useState<Week | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reloadKey, setReloadKey] = useState(0); // 올리면 다시 불러온다
  const [loadCount, setLoadCount] = useState(0); // 서버에서 새로 받아올 때마다 +1 (입력칸 되돌리기용)
  // 접속 쿠키는 httpOnly라 JS로 확인할 수 없다. 401 UNAUTHORIZED를 받으면 코드 입력 화면으로
  const [needLogin, setNeedLogin] = useState(false);

  const weekRef = useRef<Week | null>(null); // 저장 요청이 항상 최신 version을 쓰도록
  const queue = useRef<Promise<unknown>>(Promise.resolve()); // 저장 요청을 한 번에 하나씩 보낸다

  const applyWeek = (w: Week) => {
    weekRef.current = w;
    setWeek(w);
  };

  useEffect(() => {
    location.hash = confirmDate;
  }, [confirmDate]);

  // 주차가 바뀌거나 저장이 끝날 때마다 주차와 정산을 새로 받아온다.
  // 지출 추가/삭제는 week version을 바꾸지 않으므로, version 비교 없이 항상 다시 받는다.
  useEffect(() => {
    let stale = false; // 늦게 도착한 이전 주차 응답 무시
    Promise.all([api.week(confirmDate), api.settlement(confirmDate)])
      .then(([w, s]) => {
        if (stale) return;
        applyWeek(w);
        setSettlement(s);
        setLoadCount((n) => n + 1);
      })
      .catch((e: unknown) => !stale && showError(e));
    return () => {
      stale = true;
    };
  }, [confirmDate, reloadKey]);

  function showError(e: unknown, mine?: string) {
    if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
      setNeedLogin(true);
    } else if (!(e instanceof ApiError)) {
      setNotice({ kind: 'error', text: '알 수 없는 오류가 났어요. 새로고침해 주세요.', mine });
    } else if (e.code === 'VERSION_CONFLICT' && e.current) {
      applyWeek(e.current); // 최신 값으로 화면을 다시 그린다
      setNotice({ kind: 'conflict', text: e.message, mine });
    } else if (e.code === 'WEEK_CONFIRMED') {
      setNotice({ kind: 'locked', text: e.message, mine });
    } else {
      setNotice({ kind: 'error', text: e.message, mine });
    }
  }

  // 저장 요청 실행. 성공/실패와 관계없이 끝나면 다시 불러온다. 성공하면 true
  function save(action: (w: Week) => Promise<unknown>, mine?: string): Promise<boolean> {
    const run = async () => {
      const current = weekRef.current;
      if (!current) return false;
      try {
        const result = await action(current);
        if (result && typeof result === 'object' && 'contributions' in result) applyWeek(result as Week);
        setNotice(null);
        return true;
      } catch (e) {
        showError(e, mine);
        return false;
      } finally {
        setReloadKey((k) => k + 1);
      }
    };
    const p = queue.current.then(run);
    queue.current = p;
    return p;
  }

  function changeWeek(next: string) {
    setNotice(null);
    setWeek(null);
    weekRef.current = null;
    setConfirmDate(next);
  }

  if (needLogin) {
    return (
      <LoginScreen
        onLoggedIn={() => {
          setNeedLogin(false);
          setNotice(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  if (!week || !settlement) {
    return (
      <main>
        {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}
        <p className="muted center">불러오는 중…</p>
      </main>
    );
  }

  // 잠긴 주에서 막히는 것은 원자재뿐. 판매 금액과 지출은 열어 둔다
  const locked = week.materialsLocked;
  const saveSales = (field: 'salesBefore' | 'salesAfter', label: string) => (value: number) =>
    save(
      (w) => api.updateSales(confirmDate, { salesBefore: w.salesBefore, salesAfter: w.salesAfter, [field]: value, version: w.version }),
      `${label} ${formatWon(value)}원`,
    );

  return (
    <main>
      {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}

      <WeekHeader
        confirmDate={confirmDate}
        onChange={changeWeek}
        confirmed={week.confirmed}
        auto={week.manualLock === null}
        canConfirm={week.version > 0}
        onConfirm={() => save((w) => api.confirm(confirmDate, w.version), '확정')}
        onUnconfirm={() => save(() => api.unconfirm(confirmDate))}
      />
      {locked && <p className="locked-hint">확정된 주라 원자재 생산 금액은 잠겨 있어요. 판매 금액과 지출은 수정할 수 있어요.</p>}

      <section className="card">
        <h2>원자재 생산 금액</h2>
        {week.contributions.map((c) => (
          <label className="field" key={c.memberId}>
            <span>{c.name}</span>
            <MoneyInput
              label={`${c.name} 원자재`}
              value={c.materialAmount}
              disabled={locked}
              syncKey={loadCount}
              onCommit={(value) =>
                save(
                  (w) =>
                    api.updateContribution(confirmDate, c.memberId, {
                      materialAmount: value,
                      version: w.contributions.find((x) => x.memberId === c.memberId)?.version ?? 0,
                    }),
                  `원자재(${c.name}) ${formatWon(value)}원`,
                )
              }
            />
          </label>
        ))}
      </section>

      <section className="card">
        <h2>판매 금액</h2>
        <label className="field">
          <span>판매 전</span>
          <MoneyInput label="판매 전" value={week.salesBefore} syncKey={loadCount} onCommit={saveSales('salesBefore', '판매 전')} />
        </label>
        <label className="field">
          <span>판매 후</span>
          <MoneyInput label="판매 후" value={week.salesAfter} syncKey={loadCount} onCommit={saveSales('salesAfter', '판매 후')} />
        </label>
      </section>

      <ExpenseSection
        expenses={week.expenses}
        members={week.contributions}
        onAdd={(e) => save(() => api.addExpense(confirmDate, e), `지출 추가: ${e.item} ${formatWon(e.amount)}원`)}
        onDelete={(e) => {
          if (confirm(`'${e.item}' 지출을 삭제할까요?`)) {
            void save(() => api.deleteExpense(e.id), `지출 삭제: ${e.item}`);
          }
        }}
      />

      <SettlementSection s={settlement} />

      <p className="center">
        <button className="link" onClick={() => api.logout().finally(() => setNeedLogin(true))}>
          로그아웃
        </button>
      </p>
    </main>
  );
}
