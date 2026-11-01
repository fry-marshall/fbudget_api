import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsString, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";

export class UpdateSavingsGoalDto {
    @ApiPropertyOptional({ example: 'Apport voiture' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiPropertyOptional({ example: 20000, minimum: 1, maximum: MAX_INT })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    monthlyContribution?: number;

    @ApiPropertyOptional({ example: 300000, minimum: 1, maximum: MAX_INT, nullable: true, description: 'null to remove the target, the targetDate must then be null too' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    targetAmount?: number | null;

    @ApiPropertyOptional({ example: '2027-10-01', format: 'date', nullable: true, description: 'Requires a targetAmount, null to remove it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsDateOnly()
    targetDate?: string | null;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Account of the connected user debited by default for the contributions, null to unlink it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    accountId?: string | null;
}
