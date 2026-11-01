import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsISO31661Alpha2, IsNotEmpty, IsString, Matches, Max, Min, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { AccountType } from "../types";

export class UpdateAccountDto {
    @ApiPropertyOptional({ enum: AccountType })
    @ValidateIf((_, value) => value !== undefined)
    @IsEnum(AccountType)
    type?: AccountType;

    @ApiPropertyOptional({ example: 'Wave' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    operator?: string;

    @ApiPropertyOptional({ example: 'Visa *4782' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    name?: string;

    @ApiPropertyOptional({ example: '4782', pattern: '^\\d{4}$' })
    @ValidateIf((_, value) => value !== undefined)
    @Matches(/^\d{4}$/)
    last4?: string;

    @ApiPropertyOptional({ example: 'SN', pattern: '^[A-Z]{2}$', description: 'ISO 3166-1 alpha-2 code, uppercase' })
    @ValidateIf((_, value) => value !== undefined)
    @IsISO31661Alpha2()
    @Matches(/^[A-Z]{2}$/)
    country?: string;

    @ApiPropertyOptional({ example: 150000, minimum: -MAX_INT, maximum: MAX_INT, description: 'Amount in the smallest unit of the user primary currency (cents for EUR, unit for XOF)' })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @Min(-MAX_INT)
    @Max(MAX_INT)
    initialBalance?: number;

    @ApiPropertyOptional({ example: 60000, minimum: 1, maximum: MAX_INT, nullable: true, description: 'Fixed amount moved every month from the primary account to this one, refused on the primary account, null to stop it (the monthlyFundingDay must then be null too)' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    monthlyFunding?: number | null;

    @ApiPropertyOptional({ example: 28, minimum: 1, maximum: 31, nullable: true, description: 'Day of the monthly funding, requires a monthlyFunding, null to follow the day of the main fixed income' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsInt()
    @Min(1)
    @Max(31)
    monthlyFundingDay?: number | null;
}
