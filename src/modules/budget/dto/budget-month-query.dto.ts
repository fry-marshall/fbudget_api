import { ApiPropertyOptional } from "@nestjs/swagger";
import { Matches, ValidateIf } from "class-validator";

export class BudgetMonthQueryDto {
    @ApiPropertyOptional({ example: '2026-11', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'Month to compute, the current month (UTC) by default' })
    @ValidateIf((_, value) => value !== undefined)
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
    month?: string;
}
