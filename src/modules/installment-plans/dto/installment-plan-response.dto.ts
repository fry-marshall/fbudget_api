import { ApiProperty } from "@nestjs/swagger";
import { InstallmentPlanStatus } from "../types";
import { InstallmentResponseDto } from "./installment-response.dto";

export class InstallmentPlanResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ example: 'iPhone 15' })
    label?: string;

    @ApiProperty({ example: 'Klarna', nullable: true })
    provider?: string | null;

    @ApiProperty({ example: 75000, description: 'In the smallest unit of the user primary currency' })
    totalAmount?: number;

    @ApiProperty({ example: 4 })
    installmentCount?: number;

    @ApiProperty({ example: 18750, description: 'totalAmount / installmentCount rounded down, the last installment takes the remainder' })
    installmentAmount?: number;

    @ApiProperty({ example: '2026-11-15', format: 'date' })
    firstDueDate?: string;

    @ApiProperty({ enum: InstallmentPlanStatus, description: 'completed when every installment is paid' })
    status?: InstallmentPlanStatus;

    @ApiProperty({ example: 1 })
    paidCount?: number;

    @ApiProperty({ example: 56250, description: 'Sum of the unpaid installments' })
    remainingDue?: number;

    @ApiProperty({ type: InstallmentResponseDto, nullable: true, description: 'Unpaid installment with the lowest index, null when completed' })
    nextInstallment?: InstallmentResponseDto | null;

    @ApiProperty({ format: 'uuid', nullable: true })
    accountId?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true })
    categoryId?: string | null;

    @ApiProperty()
    createdAt?: Date;
}
