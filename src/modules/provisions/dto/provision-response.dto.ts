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
