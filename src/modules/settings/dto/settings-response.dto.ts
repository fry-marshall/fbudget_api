import { ApiProperty } from "@nestjs/swagger";
import { Currency } from "../types";

export class SettingsResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ enum: Currency, nullable: true, description: 'null until the user chooses it, then it cannot be changed' })
    primaryCurrency?: Currency | null;

    @ApiProperty({ example: 150000, nullable: true, description: 'Amount in the smallest unit of the primary currency' })
    monthlyBudget?: number;
}
