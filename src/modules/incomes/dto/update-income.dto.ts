import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsNotEmpty, IsString, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";

export class UpdateIncomeDto {
    @ApiPropertyOptional({ example: 'Salaire' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiPropertyOptional({ example: 248000, minimum: 1, maximum: MAX_INT, description: 'Monthly amount in the smallest unit of the user primary currency, an estimate when isVariable is true' })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    amount?: number;

    @ApiPropertyOptional({ example: 28, minimum: 1, maximum: 31, nullable: true, description: 'Day the income is received, moved to the last day of the month when the month is shorter, null to unset it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsInt()
    @Min(1)
    @Max(31)
    dayOfMonth?: number | null;

    @ApiPropertyOptional()
    @ValidateIf((_, value) => value !== undefined)
    @IsBoolean()
    isVariable?: boolean;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Account of the connected user receiving the income, null to unlink it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    accountId?: string | null;
}
