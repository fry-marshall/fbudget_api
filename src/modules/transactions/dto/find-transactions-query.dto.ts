import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsUUID, Matches, ValidateIf } from "class-validator";

export class FindTransactionsQueryDto {
    @ApiProperty({ example: '2026-10', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' })
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
    month?: string;

    @ApiPropertyOptional({ format: 'uuid' })
    @ValidateIf((_, value) => value !== undefined)
    @IsUUID()
    accountId?: string;

    @ApiPropertyOptional({ format: 'uuid' })
    @ValidateIf((_, value) => value !== undefined)
    @IsUUID()
    categoryId?: string;
}
