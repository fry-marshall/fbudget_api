import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, NotEquals, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";
import { MAX_TAG_LENGTH, MAX_TAGS } from "../types/transaction.constants";

export class CreateTransactionDto {
    @ApiProperty({ example: -4250, minimum: -MAX_INT, maximum: MAX_INT, description: 'Signed amount in the smallest unit of the user primary currency: negative for an expense, positive for an income, never 0' })
    @IsDefined()
    @IsInt()
    @NotEquals(0)
    @Min(-MAX_INT)
    @Max(MAX_INT)
    amount?: number;

    @ApiProperty({ example: '2026-10-30', format: 'date', description: 'Day of the transaction, without time, can be in the past' })
    @IsDateOnly()
    occurredOn?: string;

    @ApiProperty({ format: 'uuid', description: 'Account of the connected user' })
    @IsDefined()
    @IsUUID()
    accountId?: string;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Category of the connected user' })
    @IsOptional()
    @IsUUID()
    categoryId?: string | null;

    @ApiPropertyOptional({ example: 'Carrefour Express', nullable: true })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    merchant?: string | null;

    @ApiPropertyOptional({ example: 'Courses de la semaine', nullable: true })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    note?: string | null;

    @ApiPropertyOptional({ example: ['vacances'], maxItems: MAX_TAGS, description: `Free tags, ${MAX_TAG_LENGTH} characters max each` })
    @ValidateIf((_, value) => value !== undefined)
    @IsArray()
    @ArrayMaxSize(MAX_TAGS)
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @MaxLength(MAX_TAG_LENGTH, { each: true })
    tags?: string[];
}
