// 기존 Google Sheets 앱에서 내보낸 CSV를 읽고 DB 형태로 바꾸는 순수 함수들 (DB 접근 없음)
import { ParseDatePipe } from '../src/common/parse-date.pipe';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../src/expenses/expense.entity';

export const MEMBER_COUNT = 5;

export class SheetDataError extends Error {}

export interface ImportExpense {
  item: string;
  category: ExpenseCategory;
  amount: number;
  buyerId: number | null;
  distributed: boolean;
}

export interface ImportWeek {
  confirmDate: string;
  salesBefore: number;
  salesAfter: number;
  manualLock: boolean | null; // 원본 그대로. null = 자동 (src/weeks/lock.ts)
  materials: number[]; // 멤버 id 1~5 순서
  expenses: ImportExpense[];
}

// RFC 4180 CSV: 따옴표 안의 쉼표/줄바꿈, "" 이스케이프 처리
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f !== ''));
}

// 시트 표시값 "1,207,500" / "-965,685" / "21.18%" → 숫자
export function parseNumber(text: string): number {
  const n = Number(text.replace(/[,%\s]/g, ''));
  if (text.trim() === '' || Number.isNaN(n)) {
    throw new SheetDataError(`숫자가 아닌 값: ${JSON.stringify(text)}`);
  }
  return n;
}

function fail(where: string, value: unknown, why: string): never {
  throw new SheetDataError(`${where} = ${JSON.stringify(value)} → ${why}`);
}

function money(value: unknown, where: string, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    fail(where, value, `${min} 이상 정수가 아님`);
  }
  return value;
}

// _data 시트 한 행 → ImportWeek. "week:..." 가 아닌 key는 null (건너뜀)
// 값이 하나라도 이상하면 건너뛰지 않고 SheetDataError로 멈춘다
export function mapWeekRow(key: string, json: string): ImportWeek | null {
  const m = /^week:(.*)$/.exec(key);
  if (!m) return null;
  const confirmDate = m[1];
  try {
    new ParseDatePipe().transform(confirmDate);
  } catch {
    fail(`key`, key, 'YYYY-MM-DD 날짜가 아님');
  }
  const at = (path: string) => `week:${confirmDate} ${path}`;

  let d: Record<string, unknown>;
  try {
    d = JSON.parse(json) as Record<string, unknown>;
  } catch {
    fail(at('json'), json.slice(0, 50), 'JSON이 아님');
  }

  if (!Array.isArray(d.material) || d.material.length !== MEMBER_COUNT) {
    fail(at('material'), d.material, `길이 ${MEMBER_COUNT} 배열이 아님`);
  }
  const materials = d.material.map((v, i) => money(v, at(`material[${i}]`), 0));

  if (!Array.isArray(d.expenses)) fail(at('expenses'), d.expenses, '배열이 아님');
  const expenses = (d.expenses as Record<string, unknown>[]).map((e, i) => {
    const p = (f: string) => at(`expenses[${i}].${f}`);
    if (!EXPENSE_CATEGORIES.includes(e.cat as ExpenseCategory)) {
      fail(p('cat'), e.cat, `${EXPENSE_CATEGORIES.join('/')} 중 하나가 아님`);
    }
    if (typeof e.memo !== 'string' || !e.memo.trim() || e.memo.length > 100) {
      fail(p('memo'), e.memo, '1~100자 문자열이 아님');
    }
    let buyerId: number | null = null;
    if (e.buyer !== '' && e.buyer != null) {
      if (!Number.isInteger(e.buyer) || (e.buyer as number) < 0 || (e.buyer as number) >= MEMBER_COUNT) {
        fail(p('buyer'), e.buyer, `0~${MEMBER_COUNT - 1} 또는 빈 값이 아님`);
      }
      buyerId = (e.buyer as number) + 1;
    }
    if (typeof e.paid !== 'boolean') fail(p('paid'), e.paid, 'true/false가 아님');
    return {
      item: e.memo,
      category: e.cat as ExpenseCategory,
      amount: money(e.amount, p('amount'), 1),
      buyerId,
      distributed: e.paid,
    };
  });

  const lock = d.manualLock;
  if (lock !== true && lock !== false && lock != null) {
    fail(at('manualLock'), lock, 'true/false/null이 아님');
  }

  return {
    confirmDate,
    salesBefore: money(d.before, at('before'), 0),
    salesAfter: money(d.after, at('after'), 0),
    manualLock: lock ?? null,
    materials,
    expenses,
  };
}
