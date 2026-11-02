import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, Max, Min, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";

export class ConfirmTransactionDto {
    @ApiPropertyOptional({ example: 87000, minimum: 1, maximum: MAX_INT, description: 'Actual amount without sign in the smallest unit of the user primary currency, the sign of the pending transaction is kept. Applied to both transactions of a transfer' })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    amount?: number;

    @ApiPropertyOptional({ example: '2026-11-05', format: 'date', description: 'Actual day of the transaction. Applied to both transactions of a transfer' })
    @ValidateIf((_, value) => value !== undefined)
    @IsDateOnly()
    occurredOn?: string;
}
