import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsUUID, ValidateIf } from "class-validator";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";

export class PayInstallmentDto {
    @ApiProperty({ example: '2026-11-15', format: 'date', description: 'Day the installment was actually paid' })
    @IsDateOnly()
    occurredOn?: string;

    @ApiPropertyOptional({ format: 'uuid', description: 'Account of the connected user debited, by default the account of the pending transaction generated for the installment, otherwise the account of the plan' })
    @ValidateIf((_, value) => value !== undefined)
    @IsUUID()
    accountId?: string;
}
