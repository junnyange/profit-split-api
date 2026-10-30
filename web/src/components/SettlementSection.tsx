import type { Settlement } from '../api';
import { formatWon } from '../week';

// 정산 결과 (서버가 계산한 값을 표시만 한다)
export function SettlementSection({ s }: { s: Settlement }) {
  const rows: [string, number][] = [
    ['총 수익', s.gross],
    ['수수료 5%', s.fee],
    ['지출 ×105%', s.expenseAdjusted],
    ['분배할 금액', s.distributable],
    ['남는 금액', s.remainder],
  ];
  return (
    <section className="card">
      <h2>정산 결과</h2>
      <table className="settle">
        <thead>
          <tr>
            <th>멤버</th>
            <th>%</th>
            <th>금액</th>
          </tr>
        </thead>
        <tbody>
          {s.members.map((m) => (
            <tr key={m.memberId}>
              <td>{m.name}</td>
              <td>{m.percent.toFixed(2)}%</td>
              <td>{formatWon(m.share)}원</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="totals">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={value < 0 ? 'negative' : ''}>{formatWon(value)}원</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
