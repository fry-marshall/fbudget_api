import { Currency } from "../types";

export class SettingsResponseDto {
    id?: string;
    primaryCurrency?: Currency;
    monthlyBudget?: number;
}