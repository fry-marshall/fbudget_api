import { Transaction } from "./transaction.entity";
import { TransactionResponseDto } from "./dto/transaction-response.dto";

/**
 * Shared by the transactions, transfers, provisions, installment plans and savings goals modules, which all return transactions
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
    status: transaction.status,
    provisionId: transaction.provisionId ?? null,
    installmentId: transaction.installmentId ?? null,
    savingsGoalId: transaction.savingsGoalId ?? null,
    transferId: transaction.transferId ?? null,
    fixedChargeId: transaction.fixedChargeId ?? null,
    incomeId: transaction.incomeId ?? null,
    createdAt: transaction.createdAt,
})
