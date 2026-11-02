import { ApiProperty } from "@nestjs/swagger";
import { ProvisionStatus } from "../types";

export class ProvisionResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ example: 'Assurance auto' })
    label?: string;

    @ApiProperty({ example: 70000, description: 'Full amount paid at each due date, in the smallest unit of the user primary currency' })
    totalAmount?: number;

    @ApiProperty({ example: 12 })
    frequencyMonths?: number;

    @ApiProperty({ example: 5834, description: 'Amount to put aside each month: totalAmount / frequencyMonths rounded up, never stored' })
    monthlyAmount?: number;

    @ApiProperty({ example: 17502, nullable: true, description: 'Money actually put aside on the dedicated account: confirmed transfers received minus confirmed payments from this account, negative when a payment exceeded the reserve. Null without dedicated account or on the primary account' })
    reservedAmount?: number | null;

    @ApiProperty({ example: 25, nullable: true, description: 'reservedAmount / totalAmount as an integer between 0 and 100, null when reservedAmount is null' })
    progressPct?: number | null;

    @ApiProperty({ example: '2027-03-15', format: 'date' })
    nextDueDate?: string;

    @ApiProperty({ example: '2026-11-01', format: 'date' })
    startedAt?: string;

    @ApiProperty({ enum: ProvisionStatus })
    status?: ProvisionStatus;

    @ApiProperty({ format: 'uuid', nullable: true })
    accountId?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true })
    categoryId?: string | null;

    @ApiProperty()
    createdAt?: Date;
}
