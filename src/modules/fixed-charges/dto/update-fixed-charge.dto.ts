import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsString, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";

export class UpdateFixedChargeDto {
    @ApiPropertyOptional({ example: 'Loyer' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiPropertyOptional({ example: 85000, minimum: 1, maximum: MAX_INT, description: 'Monthly amount in the smallest unit of the user primary currency' })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    amount?: number;

    @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 31, description: 'Day the charge is debited, moved to the last day of the month when the month is shorter' })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @Min(1)
    @Max(31)
    dayOfMonth?: number;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Account of the connected user debited by the charge, null to unlink it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    accountId?: string | null;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Category of the connected user, null to unlink it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    categoryId?: string | null;
}
