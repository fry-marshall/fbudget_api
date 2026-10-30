import { ApiProperty } from "@nestjs/swagger";

export class IncomeResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ example: 'Salaire' })
    label?: string;

    @ApiProperty({ example: 248000, description: 'Monthly amount in the smallest unit of the user primary currency, an estimate when isVariable is true' })
    amount?: number;

    @ApiProperty({ example: 28, nullable: true, description: 'Day the income is received, moved to the last day of the month when the month is shorter' })
    dayOfMonth?: number | null;

    @ApiProperty()
    isVariable?: boolean;

    @ApiProperty({ format: 'uuid', nullable: true })
    accountId?: string | null;

    @ApiProperty()
    createdAt?: Date;
}
