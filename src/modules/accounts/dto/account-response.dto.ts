import { ApiProperty } from "@nestjs/swagger";
import { Currency } from "src/modules/settings/types";
import { AccountType } from "../types";

export class AccountResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ enum: AccountType })
    type?: AccountType;

    @ApiProperty({ example: 'Wave', nullable: true })
    operator?: string | null;

    @ApiProperty({ example: 'Visa *4782' })
    name?: string;

    @ApiProperty({ example: '4782', nullable: true })
    last4?: string | null;

    @ApiProperty({ example: 'SN', nullable: true })
    country?: string | null;

    @ApiProperty({ enum: Currency })
    currency?: Currency;

    @ApiProperty({ example: 150000, description: 'Amount in the smallest unit of the currency (cents for EUR, unit for XOF)' })
    initialBalance?: number;

    @ApiProperty()
    isPrimary?: boolean;

    @ApiProperty()
    createdAt?: Date;
}
