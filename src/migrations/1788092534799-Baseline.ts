import { MigrationInterface, QueryRunner } from "typeorm";

export class Baseline1788092534799 implements MigrationInterface {
    name = 'Baseline1788092534799'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`token\` \`token\` varchar(500) NULL`);
        await queryRunner.query(`ALTER TABLE \`device_histories\` CHANGE \`startTime\` \`startTime\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`device_histories\` CHANGE \`endTime\` \`endTime\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`device_histories\` DROP COLUMN \`frequencyBins\``);
        await queryRunner.query(`ALTER TABLE \`device_histories\` ADD \`frequencyBins\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`device_histories\` CHANGE \`aiStatus\` \`aiStatus\` tinyint NULL`);
        await queryRunner.query(`ALTER TABLE \`devices\` CHANGE \`description\` \`description\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`devices\` CHANGE \`minFrequency\` \`minFrequency\` double NULL`);
        await queryRunner.query(`ALTER TABLE \`devices\` CHANGE \`maxFrequency\` \`maxFrequency\` double NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_293e6bb578aee8b397c0f03ac7\` ON \`device_histories\` (\`deviceId\`, \`startTime\`, \`endTime\`)`);
        await queryRunner.query(`ALTER TABLE \`device_histories\` ADD CONSTRAINT \`FK_d6c79b5ad6e863b3599c5284539\` FOREIGN KEY (\`deviceId\`) REFERENCES \`devices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`device_histories\` DROP FOREIGN KEY \`FK_d6c79b5ad6e863b3599c5284539\``);
        await queryRunner.query(`DROP INDEX \`IDX_293e6bb578aee8b397c0f03ac7\` ON \`device_histories\``);
        await queryRunner.query(`ALTER TABLE \`devices\` CHANGE \`maxFrequency\` \`maxFrequency\` double(22) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`devices\` CHANGE \`minFrequency\` \`minFrequency\` double(22) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`devices\` CHANGE \`description\` \`description\` varchar(255) NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`device_histories\` CHANGE \`aiStatus\` \`aiStatus\` tinyint NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`device_histories\` DROP COLUMN \`frequencyBins\``);
        await queryRunner.query(`ALTER TABLE \`device_histories\` ADD \`frequencyBins\` longtext COLLATE "utf8mb4_bin" NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`device_histories\` CHANGE \`endTime\` \`endTime\` datetime NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`device_histories\` CHANGE \`startTime\` \`startTime\` datetime NULL DEFAULT 'NULL'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`token\` \`token\` varchar(500) NULL DEFAULT 'NULL'`);
    }

}
