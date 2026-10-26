import { ApiProperty } from "@nestjs/swagger";
import { IsDefined, IsEnum, IsInt, Min } from "class-validator";
import { Currency } from "../types";

export class UpdateSettingsDto {
    @ApiProperty({ enum: Currency })
    @IsDefined()
    @IsEnum(Currency)
    primaryCurrency?: Currency;

    @ApiProperty({ example: 150000, minimum: 0, description: 'Amount in cents' })
    @IsDefined()
    @IsInt()
    @Min(0)
    monthlyBudget?: number;
}
