import { type ChangeEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  value: number; // 서버(또는 부모)가 가진 값
  onCommit: (value: number) => void; // blur 또는 Enter 때, 값이 바뀌었으면 호출
  disabled?: boolean;
  syncKey?: unknown; // 바뀌면(서버에서 새로 받아오면) 입력칸을 value로 되돌린다
}

const format = (n: number) => (n ? n.toLocaleString('ko-KR') : '0');
const digitsOf = (s: string) => s.replace(/\D/g, '');

// 입력하는 동안 쉼표를 붙여 주는 금액 입력칸
export function MoneyInput({ label, value, onCommit, disabled, syncKey }: Props) {
  const [text, setText] = useState(format(value));
  const ref = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const caretDigits = useRef<number | null>(null); // 커서 앞에 있던 숫자 개수

  // 입력 중이 아닐 때만 바깥 값으로 맞춘다 (입력 중에 다른 저장이 끝나도 지우지 않음)
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value, syncKey]);

  // 쉼표가 들어가면 커서가 끝으로 튀므로, 숫자 개수 기준으로 원래 위치에 돌려놓는다
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caretDigits.current === null) return;
    let left = caretDigits.current;
    let pos = 0;
    while (pos < text.length && left > 0) {
      if (/\d/.test(text[pos])) left--;
      pos++;
    }
    el.setSelectionRange(pos, pos);
    caretDigits.current = null;
  }, [text]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    caretDigits.current = digitsOf(raw.slice(0, e.target.selectionStart ?? raw.length)).length;
    const digits = digitsOf(raw).replace(/^0+(?=\d)/, '').slice(0, 15); // 15자리까지는 Number가 정확함
    setText(digits ? Number(digits).toLocaleString('ko-KR') : '');
  }

  function handleBlur() {
    focused.current = false;
    const next = Number(digitsOf(text) || 0);
    if (next !== value) onCommit(next);
    else setText(format(value));
  }

  return (
    <input
      ref={ref}
      className="money"
      aria-label={label}
      inputMode="numeric"
      autoComplete="off"
      value={text}
      disabled={disabled}
      onFocus={(e) => {
        focused.current = true;
        if (text === '0') setText('');
        e.currentTarget.select();
      }}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
