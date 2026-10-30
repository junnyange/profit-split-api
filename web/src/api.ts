// 서버 API 호출과 응답 타입. 에러는 사용자가 읽을 문장으로 바꿔서 ApiError로 던진다.

export type Category = '가계부' | '지출';
export const CATEGORIES: Category[] = ['가계부', '지출'];

export interface Contribution {
  memberId: number;
  name: string;
  materialAmount: number;
  version: number;
}

export interface Expense {
  id: number;
  item: string;
  category: Category | null;
  amount: number;
  buyerId: number | null;
}

export interface Week {
  confirmDate: string;
  version: number;
  salesBefore: number;
  salesAfter: number;
  confirmed: boolean;
  contributions: Contribution[];
  expenses: Expense[];
}

export interface Settlement {
  members: { memberId: number; name: string; percent: number; share: number }[];
  gross: number;
  fee: number;
  expenseAdjusted: number;
  distributable: number;
  remainder: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number, // 0 = 네트워크 오류
    readonly code: string | undefined, // VERSION_CONFLICT, WEEK_CONFIRMED 등
    message: string,
    readonly current?: Week, // VERSION_CONFLICT일 때 서버의 최신 주차 데이터
  ) {
    super(message);
  }
}

function friendlyMessage(status: number, code?: string): string {
  if (code === 'VERSION_CONFLICT') return '다른 사람이 먼저 수정했어요. 최신 값으로 바꿨어요. 다시 입력해 주세요.';
  if (code === 'WEEK_CONFIRMED') return '확정된 주라서 수정할 수 없어요. 확정 해제 후 수정해 주세요.';
  if (status === 400) return '입력값이 올바르지 않아요. 금액은 숫자로, 항목은 1~100자로 입력해 주세요.';
  if (status === 404) return '대상을 찾을 수 없어요. 이미 삭제됐거나 아직 저장된 내용이 없어요. 새로고침해 주세요.';
  if (status >= 500) return '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
  return `요청이 실패했어요 (오류 ${status}).`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, undefined, '서버에 연결할 수 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.code, friendlyMessage(res.status, data?.code), data?.current);
  }
  return data as T;
}

export const api = {
  week: (d: string) => request<Week>('GET', `/weeks/${d}`),
  settlement: (d: string) => request<Settlement>('GET', `/weeks/${d}/settlement`),
  updateSales: (d: string, body: { salesBefore: number; salesAfter: number; version: number }) =>
    request<Week>('PUT', `/weeks/${d}/sales`, body),
  updateContribution: (d: string, memberId: number, body: { materialAmount: number; version: number }) =>
    request<Week>('PUT', `/weeks/${d}/contributions/${memberId}`, body),
  addExpense: (d: string, body: { item: string; amount: number; category: Category; buyerId: number | null }) =>
    request<Expense>('POST', `/weeks/${d}/expenses`, body),
  deleteExpense: (id: number) => request<void>('DELETE', `/expenses/${id}`),
  confirm: (d: string, version: number) => request<Week>('POST', `/weeks/${d}/confirm`, { version }),
  unconfirm: (d: string, version: number) => request<Week>('POST', `/weeks/${d}/unconfirm`, { version }),
};
