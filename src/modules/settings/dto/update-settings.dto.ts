import { ApiProperty } from "@nestjs/swagger";
import { IsDefined, IsEnum, IsInt, Max, Min } from "class-validator";
import { Currency } from "../types";

const MAX_INT = 2147483647

export class UpdateSettingsDto {
    @ApiProperty({ enum: Currency })
    @IsDefined()
    @IsEnum(Currency)
    primaryCurrency?: Currency;

    @ApiProperty({ example: 150000, minimum: 0, maximum: MAX_INT, description: 'Amount in cents' })
    @IsDefined()
    @IsInt()
    @Min(0)
    @Max(MAX_INT)
    monthlyBudget?: number;
}
