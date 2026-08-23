import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsersAndSettingsTable1787485502885 implements MigrationInterface {
    name = 'CreateUsersAndSettingsTable1787485502885'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."settings_primary_currency_enum" AS ENUM('eur', 'xof', 'usd')`);
        await queryRunner.query(`CREATE TABLE "settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "primary_currency" "public"."settings_primary_currency_enum" DEFAULT 'eur', "monthly_budget" integer, CONSTRAINT "PK_0669fe20e252eb692bf4d344975" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_plan_enum" AS ENUM('free')`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('user', 'admin')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "auth_provider" character varying NOT NULL, "display_name" character varying, "city" character varying, "country" character varying, "plan" "public"."users_plan_enum" NOT NULL DEFAULT 'free', "role" "public"."users_role_enum" NOT NULL DEFAULT 'user', "otp_code" character varying, "otp_expires_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "settingsId" uuid, CONSTRAINT "REL_76ba283779c8441fd5ff819c8c" UNIQUE ("settingsId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email_active" ON "users"  ("email") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_76ba283779c8441fd5ff819c8cf" FOREIGN KEY ("settingsId") REFERENCES "settings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_76ba283779c8441fd5ff819c8cf"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_email_active"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_plan_enum"`);
        await queryRunner.query(`DROP TABLE "settings"`);
        await queryRunner.query(`DROP TYPE "public"."settings_primary_currency_enum"`);
    }

}
