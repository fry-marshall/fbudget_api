import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";

export class SettleProvisionDto {
    @ApiProperty({ example: '2027-03-14', format: 'date', description: 'Day the provision was actually paid' })
    @IsDateOnly()
    occurredOn?: string;

    @ApiPropertyOptional({ example: 72000, minimum: 1, maximum: MAX_INT, description: 'Amount actually paid, positive, the totalAmount of the provision by default' })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    amount?: number;

    @ApiPropertyOptional({ format: 'uuid', description: 'Account of the connected user debited, the account of the provision by default' })
    @ValidateIf((_, value) => value !== undefined)
    @IsUUID()
    accountId?: string;
}
