import { ApiProperty } from "@nestjs/swagger";
import { Currency } from "../types";

export class SettingsResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ enum: Currency })
    primaryCurrency?: Currency;

    @ApiProperty({ example: 150000, nullable: true, description: 'Amount in cents' })
    monthlyBudget?: number;
}
