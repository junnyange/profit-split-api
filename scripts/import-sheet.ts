// 기존 시트 앱의 _data 시트(data/sheet-data.csv)를 DB로 옮긴다.
//   npm run import:sheet -- --dry-run   DB에 쓰지 않고 매핑 결과만 출력
//   npm run import:sheet                주차마다 트랜잭션으로 넣기 (다시 실행하면 그 주를 교체)
import { readFileSync } from 'node:fs';
import { In } from 'typeorm';
import dataSource from '../src/data-source';
import { Expense } from '../src/expenses/expense.entity';
import { Member } from '../src/members/member.entity';
import { Contribution } from '../src/weeks/contribution.entity';
import { Week } from '../src/weeks/week.entity';
import { ImportWeek, mapWeekRow, MEMBER_COUNT, parseCsv, SheetDataError } from './sheet';

const FILE = 'data/sheet-data.csv';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const [header, ...rows] = parseCsv(readFileSync(FILE, 'utf8'));
  if (header?.join(',') !== 'key,json,updatedAt') {
    throw new SheetDataError(`${FILE} 헤더가 key,json,updatedAt 가 아님: ${header?.join(',')}`);
  }

  // 전부 검사한 뒤에 쓴다: 중간에 이상한 값이 있으면 아무것도 넣지 않고 멈춤
  const weeks: ImportWeek[] = [];
  let skipped = 0;
  for (const [key, json] of rows) {
    const week = mapWeekRow(key, json);
    if (week) weeks.push(week);
    else skipped++;
  }
  weeks.sort((a, b) => a.confirmDate.localeCompare(b.confirmDate));

  for (const w of weeks) printWeek(w);
  const expenseCount = weeks.reduce((n, w) => n + w.expenses.length, 0);
  console.log(
    `\n주차 ${weeks.length}개, contributions ${weeks.length * MEMBER_COUNT}건, ` +
      `expenses ${expenseCount}건 (week가 아닌 key ${skipped}행 건너뜀)`,
  );
  if (dryRun) {
    console.log('--dry-run: DB에 쓰지 않음');
    return;
  }

  await dataSource.initialize();
  try {
    const ids = Array.from({ length: MEMBER_COUNT }, (_, i) => i + 1);
    const found = await dataSource.getRepository(Member).countBy({ id: In(ids) });
    if (found !== MEMBER_COUNT) {
      throw new Error(`members 테이블에 id 1~${MEMBER_COUNT}가 다 있어야 함 (현재 ${found}명)`);
    }
    for (const w of weeks) {
      const replaced = await importWeek(w);
      console.log(`${w.confirmDate}: ${replaced ? '기존 주차 교체' : '새로 추가'}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

// 주차 하나 = 트랜잭션 하나. 이미 있으면 contributions/expenses를 지우고 다시 넣는다
async function importWeek(w: ImportWeek): Promise<boolean> {
  return dataSource.transaction(async (m) => {
    const repo = m.getRepository(Week);
    const existing = await repo.findOneBy({ confirmDate: w.confirmDate });
    if (existing) {
      await m.delete(Contribution, { weekId: existing.id });
      await m.delete(Expense, { weekId: existing.id });
    }
    const week = await repo.save(
      repo.merge(existing ?? repo.create(), {
        confirmDate: w.confirmDate,
        salesBefore: w.salesBefore,
        salesAfter: w.salesAfter,
        manualLock: w.manualLock,
        confirmedAt: null, // 원본에 확정 시각이 없음
      }),
    );
    await m.insert(
      Contribution,
      w.materials.map((materialAmount, i) => ({ weekId: week.id, memberId: i + 1, materialAmount })),
    );
    if (w.expenses.length) {
      await m.insert(Expense, w.expenses.map((e) => ({ ...e, weekId: week.id })));
    }
    return !!existing;
  });
}

function printWeek(w: ImportWeek) {
  console.log(
    `\n[${w.confirmDate}] 판매 ${w.salesBefore} → ${w.salesAfter}, ` +
      `manualLock=${w.manualLock}, 원자재(id 1~5)=${w.materials.join(', ')}`,
  );
  for (const e of w.expenses) {
    console.log(
      `  - ${e.category} | ${e.item} | ${e.amount} | buyerId=${e.buyerId ?? 'null'} | distributed=${e.distributed}`,
    );
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof SheetDataError ? `원본 데이터 오류로 중단: ${e.message}` : e);
  process.exitCode = 1;
});
