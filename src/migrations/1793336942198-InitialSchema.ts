import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1793336942198 implements MigrationInterface {
    name = 'InitialSchema1793336942198'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`members\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(20) NOT NULL, UNIQUE INDEX \`IDX_2e9903f9aa7c7e15e7d268634a\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`contributions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`weekId\` int NOT NULL, \`memberId\` int NOT NULL, \`materialAmount\` bigint NOT NULL DEFAULT '0', \`version\` int NOT NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_907d5e5800293e403175b05785\` (\`weekId\`, \`memberId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`weeks\` (\`id\` int NOT NULL AUTO_INCREMENT, \`startDate\` date NOT NULL, \`salesBefore\` bigint NOT NULL DEFAULT '0', \`salesAfter\` bigint NOT NULL DEFAULT '0', \`confirmed\` tinyint NOT NULL DEFAULT 0, \`confirmedAt\` datetime NULL, \`version\` int NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_e512a9542b7611b1515b5c3bf0\` (\`startDate\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`expenses\` (\`id\` int NOT NULL AUTO_INCREMENT, \`weekId\` int NOT NULL, \`item\` varchar(100) NOT NULL, \`amount\` bigint NOT NULL, \`buyerId\` int NULL, \`distributed\` tinyint NOT NULL DEFAULT 0, \`version\` int NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`contributions\` ADD CONSTRAINT \`FK_56671ed44b34361219f26141781\` FOREIGN KEY (\`weekId\`) REFERENCES \`weeks\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`contributions\` ADD CONSTRAINT \`FK_d100de32b0aedd205c9d7a9c34c\` FOREIGN KEY (\`memberId\`) REFERENCES \`members\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`expenses\` ADD CONSTRAINT \`FK_2b00b997779b829e39fd655af9d\` FOREIGN KEY (\`weekId\`) REFERENCES \`weeks\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`expenses\` ADD CONSTRAINT \`FK_d58d69c5f6c7f90ebdb1d272ef7\` FOREIGN KEY (\`buyerId\`) REFERENCES \`members\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    // 주의: 테이블을 전부 지운다 (members 데이터 포함). 실제 데이터가 있는 DB에서 revert하지 말 것.
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`expenses\` DROP FOREIGN KEY \`FK_d58d69c5f6c7f90ebdb1d272ef7\``);
        await queryRunner.query(`ALTER TABLE \`expenses\` DROP FOREIGN KEY \`FK_2b00b997779b829e39fd655af9d\``);
        await queryRunner.query(`ALTER TABLE \`contributions\` DROP FOREIGN KEY \`FK_d100de32b0aedd205c9d7a9c34c\``);
        await queryRunner.query(`ALTER TABLE \`contributions\` DROP FOREIGN KEY \`FK_56671ed44b34361219f26141781\``);
        await queryRunner.query(`DROP TABLE \`expenses\``);
        await queryRunner.query(`DROP INDEX \`IDX_e512a9542b7611b1515b5c3bf0\` ON \`weeks\``);
        await queryRunner.query(`DROP TABLE \`weeks\``);
        await queryRunner.query(`DROP INDEX \`IDX_907d5e5800293e403175b05785\` ON \`contributions\``);
        await queryRunner.query(`DROP TABLE \`contributions\``);
        await queryRunner.query(`DROP INDEX \`IDX_2e9903f9aa7c7e15e7d268634a\` ON \`members\``);
        await queryRunner.query(`DROP TABLE \`members\``);
    }

}
