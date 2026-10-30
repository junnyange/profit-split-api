// 정산기록 시트(data/sheet-summary.csv)와 GET /api/weeks/:confirmDate/settlement 결과를 주차마다 비교한다.
//   npm run verify:sheet            (서버: VERIFY_BASE_URL, 기본 http://localhost:3001)
// 헤더에는 멤버 실명이 있어서 열 이름이 아니라 위치로 읽는다.
import { readFileSync } from 'node:fs';
import { MEMBER_COUNT, parseCsv, parseNumber } from './sheet';

const FILE = 'data/sheet-summary.csv';
const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3001';

// 열 위치: 0 주차(확정일), 1 상태, 2 판매 전, 3 판매 후, 4 총 수익, 5 수수료, 6 수수료 제외,
//          7 지출 ×105%, 8 분배할 금액, 9부터 멤버별 (% , 금액) × 5
const COL = { date: 0, status: 1, gross: 4, expenseAdjusted: 7, distributable: 8, members: 9 };

interface Settlement {
  gross: number;
  expenseAdjusted: number;
  distributable: number;
  members: { memberId: number; percent: number; share: number }[];
}

interface Check { week: string; field: string; sheet: number | string; api: number | string; ok: boolean; kind: 'total' | 'percent' | 'share' | 'status' }

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function main() {
  const [, ...rows] = parseCsv(readFileSync(FILE, 'utf8'));
  const checks: Check[] = [];

  for (const row of rows) {
    const week = row[COL.date];
    const api = await getJson<Settlement>(`/api/weeks/${week}/settlement`);
    const { confirmed } = await getJson<{ confirmed: boolean }>(`/api/weeks/${week}`);
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
    add('상태', status, confirmed ? '확정' : '수정 가능', (status === '확정') === confirmed, 'status');
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
      `\n멤버별 % ${count('percent')}, 합계(총 수익/지출 ×105%/분배할 금액) ${count('total')}, 확정 상태 ${count('status')} 일치`,
  );
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
