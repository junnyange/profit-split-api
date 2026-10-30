import { Injectable } from '@nestjs/common';

export const MATERIAL_WEIGHT = 50; // 분배율 중 원자재 기여 비중(%)
export const FEE_RATE = 5; // 판매 수수료(%)
export const EXPENSE_RATE = 5; // 지출 할증(%)

export interface SettlementInput {
  materials: number[]; // 멤버별 원자재 생산 금액 (id 순서대로)
  salesBefore: number;
  salesAfter: number;
  expenses: number[]; // 지출 원금 목록
}

export interface SettlementResult {
  percents: number[]; // 멤버별 분배율(%)
  gross: number; // 총수익 = 판매 후 - 판매 전
  fee: number; // 수수료 5%
  net: number; // 수수료 뺀 금액
  expenseRaw: number; // 지출 합계 (원금)
  expenseAdjusted: number; // 지출 합계 ×105%
  distributable: number; // 분배할 금액
  shares: number[]; // 멤버별 정산액 (원 단위 아래 버림)
  remainder: number; // 버림 때문에 남는 금액
}

@Injectable()
export class SettlementService {
  calculate(input: SettlementInput): SettlementResult {
    const n = input.materials.length;
    const materialTotal = sum(input.materials);
    const laborEach = (100 - MATERIAL_WEIGHT) / n; // 5명이면 10%

    const percents = input.materials.map((m) => {
      // 원자재가 전부 0이면 똑같이 나눔
      const materialShare = materialTotal ? (m / materialTotal) * 100 : 100 / n;
      return (materialShare * MATERIAL_WEIGHT) / 100 + laborEach;
    });

    const gross = input.salesAfter - input.salesBefore;
    const fee = (gross * FEE_RATE) / 100;
    const net = gross - fee;
    const expenseRaw = sum(input.expenses);
    const expenseAdjusted = expenseRaw * (1 + EXPENSE_RATE / 100);
    const distributable = net - expenseAdjusted;

    const shares = percents.map((p) =>
      distributable > 0 ? Math.floor((distributable * p) / 100) : 0,
    );
    const remainder =
      distributable > 0 ? Math.round(distributable) - sum(shares) : 0;

    return {
      percents, gross, fee, net, expenseRaw,
      expenseAdjusted, distributable, shares, remainder,
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
