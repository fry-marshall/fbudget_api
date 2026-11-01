import { ApiProperty } from "@nestjs/swagger";
import { InstallmentStatus } from "../types";

export class InstallmentResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ example: 1, description: 'From 1 to installmentCount' })
    index?: number;

    @ApiProperty({ example: '2026-11-15', format: 'date' })
    dueDate?: string;

    @ApiProperty({ example: 18750, description: 'In the smallest unit of the user primary currency' })
    amount?: number;

    @ApiProperty({ enum: InstallmentStatus, description: 'paid when a transaction pays it, due when unpaid and due this month or before, future otherwise' })
    status?: InstallmentStatus;

    @ApiProperty({ format: 'uuid', nullable: true, description: 'Transaction paying the installment, deleting it makes the installment unpaid again' })
    transactionId?: string | null;

    @ApiProperty({ example: '2026-11-15', format: 'date', nullable: true })
    paidOn?: string | null;
}
