import { type FormEvent, useState } from 'react';
import { CATEGORIES, type Category, type Contribution, type Expense } from '../api';
import { formatWon } from '../week';
import { MoneyInput } from './MoneyInput';

interface Props {
  expenses: Expense[];
  members: Contribution[]; // 매입자 드롭다운의 이름은 API에서 받은 것만 쓴다
  onAdd: (e: { item: string; amount: number; category: Category; buyerId: number | null }) => Promise<boolean>;
  onDelete: (e: Expense) => void;
}

// 지출 목록 + 추가 폼
// 확정된(잠긴) 주에서도 지출은 추가/삭제할 수 있다
export function ExpenseSection({ expenses, members, onAdd, onDelete }: Props) {
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<Category>('지출');
  const [buyerId, setBuyerId] = useState<number | null>(null);
  const nameOf = (id: number | null) => members.find((m) => m.memberId === id)?.name ?? '없음';
  const [invalid, setInvalid] = useState(false);

  // 버튼은 금액 입력 중에도 눌리게 둔다: 금액은 blur 때 반영되므로, 버튼을 미리 막으면 첫 탭이 무시된다
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (item.trim() === '' || amount < 1) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (await onAdd({ item: item.trim(), amount, category, buyerId })) {
      setItem('');
      setAmount(0);
    }
  }

  return (
    <section className="card">
      <h2>지출</h2>
      {expenses.length === 0 && <p className="muted">아직 지출이 없어요.</p>}
      <ul className="expenses">
        {expenses.map((e) => (
          <li key={e.id}>
            <div>
              <span className="tag">{e.category ?? '-'}</span> {e.item}
              <small className="muted"> · 매입자 {nameOf(e.buyerId)}</small>
            </div>
            <div className="row-end">
              <span>{formatWon(e.amount)}원</span>
              <button className="danger" onClick={() => onDelete(e)} aria-label={`${e.item} 삭제`}>
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form className="expense-form" onSubmit={submit}>
        <input aria-label="항목" placeholder="항목" maxLength={100} value={item} onChange={(e) => setItem(e.target.value)} />
        <MoneyInput label="지출 금액" value={amount} onCommit={setAmount} />
        <select aria-label="구분" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="매입자"
          value={buyerId ?? ''}
          onChange={(e) => setBuyerId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">매입자 없음</option>
          {members.map((m) => (
            <option key={m.memberId} value={m.memberId}>
              {m.name}
            </option>
          ))}
        </select>
        {invalid && <p className="form-hint">항목과 금액(1원 이상)을 입력해 주세요.</p>}
        <button className="primary" type="submit">
          추가
        </button>
      </form>
    </section>
  );
}
