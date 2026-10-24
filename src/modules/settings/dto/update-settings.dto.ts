import { IsDefined, IsEnum, IsInt, Min } from "class-validator";
import { Currency } from "../types";

export class UpdateSettingsDto {
    @IsDefined()
    @IsEnum(Currency)
    primaryCurrency?: Currency;

    @IsDefined()
    @IsInt()
    @Min(0)
    monthlyBudget?: number;
}