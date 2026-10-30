import { MigrationInterface, QueryRunner } from "typeorm";

// confirmed(true/false) → manualLock(true/false/null). 잠김 여부는 앱이 매번 계산한다:
//   manualLock ?? (지금 ≥ 확정일 00:00 KST)   (src/weeks/lock.ts)
// 손으로 작성함. migration:generate는 confirmed를 manualLock으로 이름만 바꿔서 false가 "수동 해제"가 되고,
// 아직 오지 않은 주(예: 2026-11-03)가 확정일이 지나도 자동으로 잠기지 않게 된다.
// 변환 규칙 (마이그레이션 시점의 잠김 상태가 바뀌지 않게):
//   confirmed = 1                    → 1    (수동 잠금)
//   confirmed = 0, 확정일이 지났음    → 0    (누가 풀어 둔 주로 보고 유지)
//   confirmed = 0, 확정일 전          → NULL (자동 규칙에 맡김)
const KST_NOW = "DATE_ADD(UTC_TIMESTAMP(), INTERVAL 9 HOUR)";

export class ConfirmedToManualLock1793340632452 implements MigrationInterface {
    name = 'ConfirmedToManualLock1793340632452'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`weeks\` ADD \`manualLock\` tinyint NULL`);
        await queryRunner.query(
            `UPDATE \`weeks\` SET \`manualLock\` = CASE
               WHEN \`confirmed\` = 1 THEN 1
               WHEN TIMESTAMP(\`confirmDate\`) <= ${KST_NOW} THEN 0
               ELSE NULL END`,
        );
        await queryRunner.query(`ALTER TABLE \`weeks\` DROP COLUMN \`confirmed\``);
    }

    // 되돌릴 때는 그 시점의 실제 잠김 여부를 confirmed로 저장한다 (수동/자동 구분은 사라짐)
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`weeks\` ADD \`confirmed\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(
            `UPDATE \`weeks\` SET \`confirmed\` = COALESCE(\`manualLock\`, TIMESTAMP(\`confirmDate\`) <= ${KST_NOW})`,
        );
        await queryRunner.query(`ALTER TABLE \`weeks\` DROP COLUMN \`manualLock\``);
    }

}
