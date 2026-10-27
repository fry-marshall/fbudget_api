import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDefined, IsEnum, IsInt, IsISO31661Alpha2, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { Currency } from "src/modules/settings/types";
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

    @ApiProperty({ enum: Currency, description: 'Cannot be changed after creation' })
    @IsDefined()
    @IsEnum(Currency)
    currency?: Currency;

    @ApiProperty({ example: 150000, minimum: -MAX_INT, maximum: MAX_INT, description: 'Amount in the smallest unit of the currency (cents for EUR, unit for XOF)' })
    @IsDefined()
    @IsInt()
    @Min(-MAX_INT)
    @Max(MAX_INT)
    initialBalance?: number;
}
