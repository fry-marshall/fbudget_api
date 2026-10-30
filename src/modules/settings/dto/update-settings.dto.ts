import { ApiProperty } from "@nestjs/swagger";
import { IsDefined, IsEnum, IsInt, Max, Min } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { Currency } from "../types";

export class UpdateSettingsDto {
    @ApiProperty({ enum: Currency, description: 'Set once, sending another currency afterwards returns 400' })
    @IsDefined()
    @IsEnum(Currency)
    primaryCurrency?: Currency;

    @ApiProperty({ example: 150000, minimum: 0, maximum: MAX_INT, description: 'Amount in the smallest unit of the primary currency' })
    @IsDefined()
    @IsInt()
    @Min(0)
    @Max(MAX_INT)
    monthlyBudget?: number;
}
