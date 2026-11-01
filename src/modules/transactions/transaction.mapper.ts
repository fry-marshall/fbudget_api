import { Transaction } from "./transaction.entity";
import { TransactionResponseDto } from "./dto/transaction-response.dto";

/**
 * Shared by the transactions and the provisions modules, which both return transactions
 */
export const toTransactionDto = (transaction: Transaction): TransactionResponseDto => ({
    id: transaction.id,
    amount: transaction.amount,
    occurredOn: transaction.occurredOn,
    accountId: transaction.accountId ?? null,
    categoryId: transaction.categoryId ?? null,
    merchant: transaction.merchant ?? null,
    note: transaction.note ?? null,
    tags: transaction.tags ?? [],
    sourceType: transaction.sourceType,
    provisionId: transaction.provisionId ?? null,
    installmentId: transaction.installmentId ?? null,
    createdAt: transaction.createdAt,
})
