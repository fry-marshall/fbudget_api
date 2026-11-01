import { ApiProperty } from "@nestjs/swagger";
import { TransactionSourceType, TransactionStatus } from "../types";

export class TransactionResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ example: -4250, description: 'Signed amount in the smallest unit of the user primary currency: negative for an expense, positive for an income' })
    amount?: number;

    @ApiProperty({ example: '2026-10-30', format: 'date' })
    occurredOn?: string;

    @ApiProperty({ format: 'uuid', nullable: true, description: 'null when the account has been deleted' })
    accountId?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true })
    categoryId?: string | null;

    @ApiProperty({ example: 'Carrefour Express', nullable: true })
    merchant?: string | null;

    @ApiProperty({ example: 'Courses de la semaine', nullable: true })
    note?: string | null;

    @ApiProperty({ example: ['vacances'] })
    tags?: string[];

    @ApiProperty({ enum: TransactionSourceType })
    sourceType?: TransactionSourceType;

    @ApiProperty({ enum: TransactionStatus, description: 'pending when generated for the month and waiting for the user validation, only the confirmed transactions change the balances' })
    status?: TransactionStatus;

    @ApiProperty({ format: 'uuid', nullable: true, description: 'Provision settled by this transaction' })
    provisionId?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true, description: 'Installment paid by this transaction' })
    installmentId?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true, description: 'Savings goal this transaction contributes to' })
    savingsGoalId?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true, description: 'Shared by the two transactions of a transfer: the debit of the source account and the credit of the destination account' })
    transferId?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true, description: 'Fixed charge this transaction was generated from' })
    fixedChargeId?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true, description: 'Income this transaction was generated from' })
    incomeId?: string | null;

    @ApiProperty()
    createdAt?: Date;
}
