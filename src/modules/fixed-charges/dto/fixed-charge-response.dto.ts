import { ApiProperty } from "@nestjs/swagger";

export class FixedChargeResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ example: 'Loyer' })
    label?: string;

    @ApiProperty({ example: 85000, description: 'Monthly amount in the smallest unit of the user primary currency' })
    amount?: number;

    @ApiProperty({ example: 5, description: 'Day the charge is debited, moved to the last day of the month when the month is shorter' })
    dayOfMonth?: number;

    @ApiProperty({ format: 'uuid', nullable: true })
    accountId?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true })
    categoryId?: string | null;

    @ApiProperty()
    createdAt?: Date;
}
