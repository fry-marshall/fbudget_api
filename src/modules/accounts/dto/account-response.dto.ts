import { ApiProperty } from "@nestjs/swagger";
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

    @ApiProperty({ example: 150000, description: 'Amount in the smallest unit of the user primary currency (cents for EUR, unit for XOF)' })
    initialBalance?: number;

    @ApiProperty()
    isPrimary?: boolean;

    @ApiProperty({ example: 60000, nullable: true, description: 'Fixed amount moved every month from the primary account to this one' })
    monthlyFunding?: number | null;

    @ApiProperty({ example: 28, nullable: true, description: 'Day of the monthly funding, null to follow the day of the main fixed income' })
    monthlyFundingDay?: number | null;

    @ApiProperty()
    createdAt?: Date;
}
