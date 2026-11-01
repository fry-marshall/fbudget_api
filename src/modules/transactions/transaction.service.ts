import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { And, LessThan, MoreThanOrEqual, QueryFailedError, Repository } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { addMonthsToDate } from "src/common/helpers/helpers";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { Transaction } from "./transaction.entity";
import { TransactionResponseDto } from "./dto/transaction-response.dto";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { UpdateTransactionDto } from "./dto/update-transaction.dto";
import { FindTransactionsQueryDto } from "./dto/find-transactions-query.dto";
import { TransactionSourceType } from "./types";
import { toTransactionDto } from "./transaction.mapper";

const FOREIGN_KEY_VIOLATION = '23503'

@Injectable()
export class TransactionService {

    constructor(
        @InjectRepository(Transaction)
        private transactionRepository: Repository<Transaction>
    ) { }

    async findAll(userId: string, { month, accountId, categoryId }: FindTransactionsQueryDto): Promise<TransactionResponseDto[]> {
        const transactions = await this.transactionRepository.find({
            where: {
                userId,
                ...(accountId && { accountId }),
                ...(categoryId && { categoryId }),
                occurredOn: And(MoreThanOrEqual(`${month}-01`), LessThan(addMonthsToDate(`${month}-01`, 1)))
            },
            order: { occurredOn: 'DESC', createdAt: 'DESC' }
        })

        return transactions.map(toTransactionDto)
    }

    async create(userId: string, createTransactionDto: CreateTransactionDto): Promise<TransactionResponseDto> {
        await this.checkUserRelations(userId, createTransactionDto)

        try {
            const transaction = await this.transactionRepository.save({ ...createTransactionDto, sourceType: TransactionSourceType.MANUAL, userId })

            return toTransactionDto(transaction)
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    async update(userId: string, transactionId: string, updateTransactionDto: UpdateTransactionDto): Promise<TransactionResponseDto> {
        const transaction = await this.findUserTransaction(userId, transactionId)
        this.checkTransferEditable(transaction, updateTransactionDto)
        await this.checkUserRelations(userId, updateTransactionDto)

        try {
            await this.transactionRepository.update(transaction.id!, { ...updateTransactionDto })
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }

        return toTransactionDto((await this.transactionRepository.findOneBy({ id: transaction.id }))!)
    }

    /**
     * Deleting one transaction of a transfer deletes the other one in the same statement
     */
    async remove(userId: string, transactionId: string): Promise<{ message: string }> {
        const transaction = await this.findUserTransaction(userId, transactionId)

        await this.transactionRepository.delete(transaction.transferId ? { transferId: transaction.transferId, userId } : transaction.id!)

        return { message: SUCCESS_MESSAGES.TRANSACTION.TRANSACTION_DELETED }
    }

    private async findUserTransaction(userId: string, transactionId: string): Promise<Transaction> {
        const transaction = await this.transactionRepository.findOne({ where: { id: transactionId, userId } })

        if (!transaction) {
            throw new NotFoundException(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
        }

        return transaction
    }

    /**
     * Both transactions of a transfer must keep the same amount, date and accounts, and a transfer has no category
     */
    private checkTransferEditable(transaction: Transaction, { amount, occurredOn, accountId, categoryId }: UpdateTransactionDto): void {
        if (transaction.transferId && [amount, occurredOn, accountId, categoryId].some((value) => value !== undefined)) {
            throw new ConflictException(ERRORS_MESSAGES.TRANSACTIONS.TRANSFER_NOT_EDITABLE)
        }
    }

    private async checkUserRelations(userId: string, { accountId, categoryId }: { accountId?: string | null, categoryId?: string | null }): Promise<void> {
        const { manager } = this.transactionRepository

        if (accountId && !(await manager.exists(Account, { where: { id: accountId, userId } }))) {
            throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        }

        if (categoryId && !(await manager.exists(Category, { where: { id: categoryId, userId } }))) {
            throw new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
        }
    }

    /**
     * The user, the account or the category may be deleted between the checks and the write
     */
    private handleForeignKeyViolation(err: unknown): void {
        if (err instanceof QueryFailedError && err.driverError.code === FOREIGN_KEY_VIOLATION) {
            const detail = String(err.driverError.detail)

            if (detail.includes('accountId')) {
                throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            }
            if (detail.includes('categoryId')) {
                throw new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
            }
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        }
    }
}
