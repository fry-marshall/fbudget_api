import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsInt, IsISO8601, IsNotEmpty, IsString, IsUUID, Matches, Max, MaxLength, Min, NotEquals, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { MAX_TAG_LENGTH, MAX_TAGS } from "../types/transaction.constants";

export class UpdateTransactionDto {
    @ApiPropertyOptional({ example: -4250, minimum: -MAX_INT, maximum: MAX_INT, description: 'Signed amount in the smallest unit of the user primary currency: negative for an expense, positive for an income, never 0' })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @NotEquals(0)
    @Min(-MAX_INT)
    @Max(MAX_INT)
    amount?: number;

    @ApiPropertyOptional({ example: '2026-10-30', format: 'date', description: 'Day of the transaction, without time, can be in the past' })
    @ValidateIf((_, value) => value !== undefined)
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    @IsISO8601({ strict: true })
    occurredOn?: string;

    @ApiPropertyOptional({ format: 'uuid', description: 'Account of the connected user, cannot be unset' })
    @ValidateIf((_, value) => value !== undefined)
    @IsUUID()
    accountId?: string;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Category of the connected user, null to unlink it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    categoryId?: string | null;

    @ApiPropertyOptional({ example: 'Carrefour Express', nullable: true, description: 'null to remove it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsString()
    @IsNotEmpty()
    merchant?: string | null;

    @ApiPropertyOptional({ example: 'Courses de la semaine', nullable: true, description: 'null to remove it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsString()
    @IsNotEmpty()
    note?: string | null;

    @ApiPropertyOptional({ example: ['vacances'], maxItems: MAX_TAGS, description: `Free tags, ${MAX_TAG_LENGTH} characters max each, replace the current ones, [] to remove them` })
    @ValidateIf((_, value) => value !== undefined)
    @IsArray()
    @ArrayMaxSize(MAX_TAGS)
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @MaxLength(MAX_TAG_LENGTH, { each: true })
    tags?: string[];
}
