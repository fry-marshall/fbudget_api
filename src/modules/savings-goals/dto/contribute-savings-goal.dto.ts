import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDefined, IsInt, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";

export class ContributeSavingsGoalDto {
    @ApiProperty({ example: 20000, minimum: 1, maximum: MAX_INT, description: 'Amount put aside, positive' })
    @IsDefined()
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    amount?: number;

    @ApiProperty({ example: '2026-11-01', format: 'date', description: 'Day of the transfer' })
    @IsDateOnly()
    occurredOn?: string;

    @ApiPropertyOptional({ format: 'uuid', description: 'Account of the connected user debited, the primary account by default, must differ from the account of the savings goal' })
    @ValidateIf((_, value) => value !== undefined)
    @IsUUID()
    accountId?: string;
}
