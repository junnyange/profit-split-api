import { MigrationInterface, QueryRunner } from "typeorm";

// 손으로 작성함. migration:generate는 unique 인덱스를 DROP 후 CHANGE, 다시 ADD하는 SQL을 만든다
// (그 사이 startDate 중복을 막는 제약이 없어짐). RENAME COLUMN/INDEX는 데이터와 제약을 그대로 둔 채 이름만 바꾼다.
// 인덱스 새 이름은 TypeORM이 confirmDate 기준으로 계산하는 이름과 같아야 migration:generate --check가 "변경 없음"이 된다.
export class RenameStartDateAddCategory1793338507080 implements MigrationInterface {
    name = 'RenameStartDateAddCategory1793338507080'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`weeks\` RENAME COLUMN \`startDate\` TO \`confirmDate\``);
        await queryRunner.query(`ALTER TABLE \`weeks\` RENAME INDEX \`IDX_e512a9542b7611b1515b5c3bf0\` TO \`IDX_3f776dbf63e93af56ba53202f3\``);
        await queryRunner.query(`ALTER TABLE \`expenses\` ADD \`category\` varchar(10) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`expenses\` DROP COLUMN \`category\``);
        await queryRunner.query(`ALTER TABLE \`weeks\` RENAME INDEX \`IDX_3f776dbf63e93af56ba53202f3\` TO \`IDX_e512a9542b7611b1515b5c3bf0\``);
        await queryRunner.query(`ALTER TABLE \`weeks\` RENAME COLUMN \`confirmDate\` TO \`startDate\``);
    }

}
