// 새 DB에 멤버를 넣는다. 실명이 레포에 들어가지 않게 이름은 환경변수로만 받는다.
//   SEED_MEMBERS=A,B,C,D,E node dist/seed-members.js
// members가 비어 있을 때만 적힌 순서대로(id 1부터) 넣고, 한 명이라도 있으면 아무것도 하지 않는다.
// SEED_MEMBERS가 비어 있어도 아무것도 하지 않는다 (배포 컨테이너가 시작할 때마다 실행되므로).
import dataSource from './data-source';
import { Member } from './members/member.entity';

const NAME_MAX = 20; // members.name varchar(20)

// "A, B ,C" → ['A','B','C']. 빈 값이면 []. 이름이 길거나 겹치면 에러
export function parseSeedMembers(raw: string | undefined): string[] {
  const names = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const name of names) {
    if (name.length > NAME_MAX) throw new Error(`SEED_MEMBERS: 이름은 ${NAME_MAX}자 이하여야 합니다 (${name.length}자)`);
  }
  if (new Set(names).size !== names.length) throw new Error('SEED_MEMBERS: 같은 이름이 두 번 있습니다');
  return names;
}

async function main() {
  const names = parseSeedMembers(process.env.SEED_MEMBERS);
  if (names.length === 0) {
    console.log('[seed] SEED_MEMBERS가 비어 있어 건너뜀');
    return;
  }
  await dataSource.initialize();
  try {
    await dataSource.transaction(async (em) => {
      const count = await em.count(Member);
      if (count > 0) {
        console.log(`[seed] members에 이미 ${count}명이 있어 건너뜀`);
        return;
      }
      // 한 번에 넣어야 적힌 순서대로 id가 1, 2, 3... 이 된다
      await em.insert(Member, names.map((name) => ({ name })));
      console.log(`[seed] 멤버 ${names.length}명 추가`); // 이름은 로그에 남기지 않는다
    });
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error('[seed] 실패:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
