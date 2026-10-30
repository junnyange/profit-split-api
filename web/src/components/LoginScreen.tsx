import { type FormEvent, useState } from 'react';
import { api, ApiError } from '../api';

// 공용 접속 코드 입력 화면. 맞으면 서버가 httpOnly 쿠키를 주고, 화면은 onLoggedIn만 호출한다
export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    try {
      await api.login(code);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '알 수 없는 오류가 났어요.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <form className="card login" onSubmit={submit}>
        <h2>주간 정산</h2>
        <p className="muted">접속 코드를 입력해 주세요.</p>
        <input
          aria-label="접속 코드"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="current-password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        {error && (
          <p className="form-hint" role="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={!code || busy}>
          들어가기
        </button>
      </form>
    </main>
  );
}
