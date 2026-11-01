import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDefined, IsEnum, IsInt, IsISO31661Alpha2, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { AccountType } from "../types";

export class CreateAccountDto {
    @ApiProperty({ enum: AccountType })
    @IsDefined()
    @IsEnum(AccountType)
    type?: AccountType;

    @ApiPropertyOptional({ example: 'Wave' })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    operator?: string;

    @ApiProperty({ example: 'Visa *4782' })
    @IsString()
    @IsNotEmpty()
    name?: string;

    @ApiPropertyOptional({ example: '4782', pattern: '^\\d{4}$' })
    @IsOptional()
    @Matches(/^\d{4}$/)
    last4?: string;

    @ApiPropertyOptional({ example: 'SN', pattern: '^[A-Z]{2}$', description: 'ISO 3166-1 alpha-2 code, uppercase' })
    @IsOptional()
    @IsISO31661Alpha2()
    @Matches(/^[A-Z]{2}$/)
    country?: string;

    @ApiProperty({ example: 150000, minimum: -MAX_INT, maximum: MAX_INT, description: 'Amount in the smallest unit of the user primary currency (cents for EUR, unit for XOF)' })
    @IsDefined()
    @IsInt()
    @Min(-MAX_INT)
    @Max(MAX_INT)
    initialBalance?: number;

    @ApiPropertyOptional({ example: 60000, minimum: 1, maximum: MAX_INT, nullable: true, description: 'Fixed amount moved every month from the primary account to this one, refused on the primary account' })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    monthlyFunding?: number | null;

    @ApiPropertyOptional({ example: 28, minimum: 1, maximum: 31, nullable: true, description: 'Day of the monthly funding, requires a monthlyFunding, null to follow the day of the main fixed income' })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(31)
    monthlyFundingDay?: number | null;
}
