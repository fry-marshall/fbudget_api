import { ApiProperty } from "@nestjs/swagger";
import { TransactionSourceType } from "../types";

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

    @ApiProperty({ format: 'uuid', nullable: true, description: 'Provision settled by this transaction' })
    provisionId?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true, description: 'Installment paid by this transaction' })
    installmentId?: string | null;

    @ApiProperty()
    createdAt?: Date;
}
