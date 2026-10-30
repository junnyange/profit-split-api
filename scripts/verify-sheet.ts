// 정산기록 시트(data/sheet-summary.csv)와 GET /api/weeks/:confirmDate/settlement 결과를 주차마다 비교한다.
// _data 시트(data/sheet-data.csv)의 manualLock과 GET /api/weeks/:confirmDate의 manualLock도 비교한다.
//   npm run verify:sheet            (서버: VERIFY_BASE_URL, 기본 http://localhost:3001)
// 접속 코드는 .env의 APP_ACCESS_CODE로 로그인해서 쿠키를 받는다.
// 헤더에는 멤버 실명이 있어서 열 이름이 아니라 위치로 읽는다.
import { existsSync, readFileSync } from 'node:fs';
import { mapWeekRow, MEMBER_COUNT, parseCsv, parseNumber } from './sheet';

if (existsSync('.env')) process.loadEnvFile(); // 셸에서 설정한 값이 우선
const FILE = 'data/sheet-summary.csv';
const DATA_FILE = 'data/sheet-data.csv';
const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3001';
let cookie = '';

// 열 위치: 0 주차(확정일), 1 상태, 2 판매 전, 3 판매 후, 4 총 수익, 5 수수료, 6 수수료 제외,
//          7 지출 ×105%, 8 분배할 금액, 9부터 멤버별 (% , 금액) × 5
const COL = { date: 0, status: 1, gross: 4, expenseAdjusted: 7, distributable: 8, members: 9 };

interface Settlement {
  gross: number;
  expenseAdjusted: number;
  distributable: number;
  members: { memberId: number; percent: number; share: number }[];
}

interface Check { week: string; field: string; sheet: number | string; api: number | string; ok: boolean; kind: 'total' | 'percent' | 'share' | 'status' | 'manualLock' }

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: { cookie } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: process.env.APP_ACCESS_CODE ?? '' }),
  });
  if (res.status !== 204) throw new Error(`로그인 실패 (${res.status}). APP_ACCESS_CODE를 확인하세요`);
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
}

async function main() {
  await login();
  const [, ...rows] = parseCsv(readFileSync(FILE, 'utf8'));
  const [, ...dataRows] = parseCsv(readFileSync(DATA_FILE, 'utf8'));
  const sheetLock = new Map(
    dataRows.flatMap(([key, json]) => {
      const w = mapWeekRow(key, json);
      return w ? [[w.confirmDate, w.manualLock] as const] : [];
    }),
  );
  const checks: Check[] = [];

  for (const row of rows) {
    const week = row[COL.date];
    const api = await getJson<Settlement>(`/api/weeks/${week}/settlement`);
    const { confirmed, manualLock } = await getJson<{ confirmed: boolean; manualLock: boolean | null }>(`/api/weeks/${week}`);
    const add = (field: string, sheet: number | string, apiValue: number | string, ok: boolean, kind: Check['kind']) =>
      checks.push({ week, field, sheet, api: apiValue, ok, kind });

    // 시트는 원 단위 표시(반올림)라서 API 값을 반올림해서 비교
    for (const f of ['gross', 'expenseAdjusted', 'distributable'] as const) {
      const s = parseNumber(row[COL[f]]);
      add(f, s, api[f], Math.round(api[f]) === s, 'total');
    }
    for (let i = 0; i < MEMBER_COUNT; i++) {
      const pct = parseNumber(row[COL.members + i * 2]);
      const share = parseNumber(row[COL.members + i * 2 + 1]);
      const m = api.members[i];
      add(`id${m.memberId} %`, pct, m.percent, Math.abs(m.percent - pct) <= 0.005 + 1e-9, 'percent');
      add(`id${m.memberId} 금액`, share, m.share, m.share === share, 'share');
    }
    const status = row[COL.status];
    // 상태는 시트를 내보낸 시점(2026-10-30) 기준. 자동 잠금 주는 확정일이 지나면 API가 '확정'으로 바뀐다
    add('상태', status, confirmed ? '확정' : '수정 가능', (status === '확정') === confirmed, 'status');
    const lock = sheetLock.get(week) ?? null;
    add('manualLock', String(lock), String(manualLock), lock === manualLock, 'manualLock');
  }

  console.log(['주차', '항목', '시트', 'API', '결과'].join('\t'));
  for (const c of checks) {
    console.log([c.week, c.field, c.sheet, c.api, c.ok ? 'OK' : '불일치'].join('\t'));
  }

  const count = (kind: Check['kind']) => {
    const list = checks.filter((c) => c.kind === kind);
    return `${list.filter((c) => c.ok).length}/${list.length}`;
  };
  const shares = checks.filter((c) => c.kind === 'share');
  console.log(
    `\n${rows.length}주 × ${MEMBER_COUNT}명 = ${shares.length}개 정산액 중 ${shares.filter((c) => c.ok).length}개 일치` +
      `\n멤버별 % ${count('percent')}, 합계(총 수익/지출 ×105%/분배할 금액) ${count('total')}, 확정 상태 ${count('status')}, manualLock ${count('manualLock')} 일치`,
  );
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
