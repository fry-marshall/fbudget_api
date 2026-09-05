import { IsDefined, IsEnum, IsInt } from "class-validator";
import { Currency } from "../types";

export class UpdateSettingsDto {
    @IsDefined()
    @IsEnum(Currency)
    primaryCurrency?: Currency

    @IsDefined()
    @IsInt()
    monthlyBudget?: number
}