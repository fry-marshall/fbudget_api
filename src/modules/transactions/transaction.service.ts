import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { And, LessThan, MoreThanOrEqual, QueryFailedError, Repository } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { Transaction } from "./transaction.entity";
import { TransactionResponseDto } from "./dto/transaction-response.dto";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { UpdateTransactionDto } from "./dto/update-transaction.dto";
import { FindTransactionsQueryDto } from "./dto/find-transactions-query.dto";
import { TransactionSourceType } from "./types";

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
                occurredOn: And(MoreThanOrEqual(`${month}-01`), LessThan(this.firstDayOfNextMonth(month!)))
            },
            order: { occurredOn: 'DESC', createdAt: 'DESC' }
        })

        return transactions.map((transaction) => this.toDto(transaction))
    }

    async create(userId: string, createTransactionDto: CreateTransactionDto): Promise<TransactionResponseDto> {
        await this.checkUserRelations(userId, createTransactionDto)

        try {
            const transaction = await this.transactionRepository.save({ ...createTransactionDto, sourceType: TransactionSourceType.MANUAL, userId })

            return this.toDto(transaction)
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    async update(userId: string, transactionId: string, updateTransactionDto: UpdateTransactionDto): Promise<TransactionResponseDto> {
        const transaction = await this.findUserTransaction(userId, transactionId)
        await this.checkUserRelations(userId, updateTransactionDto)

        try {
            await this.transactionRepository.update(transaction.id!, { ...updateTransactionDto })
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }

        return this.toDto((await this.transactionRepository.findOneBy({ id: transaction.id }))!)
    }

    async remove(userId: string, transactionId: string): Promise<{ message: string }> {
        const transaction = await this.findUserTransaction(userId, transactionId)

        await this.transactionRepository.delete(transaction.id!)

        return { message: SUCCESS_MESSAGES.TRANSACTION.TRANSACTION_DELETED }
    }

    /**
     * month is validated as YYYY-MM by the query DTO
     */
    private firstDayOfNextMonth(month: string): string {
        const [year, monthIndex] = month.split('-').map(Number)
        const nextMonth = new Date(Date.UTC(year, monthIndex, 1))

        return nextMonth.toISOString().slice(0, 10)
    }

    private async findUserTransaction(userId: string, transactionId: string): Promise<Transaction> {
        const transaction = await this.transactionRepository.findOne({ where: { id: transactionId, userId } })

        if (!transaction) {
            throw new NotFoundException(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
        }

        return transaction
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

    private toDto(transaction: Transaction): TransactionResponseDto {
        return {
            id: transaction.id,
            amount: transaction.amount,
            occurredOn: transaction.occurredOn,
            accountId: transaction.accountId ?? null,
            categoryId: transaction.categoryId ?? null,
            merchant: transaction.merchant ?? null,
            note: transaction.note ?? null,
            tags: transaction.tags ?? [],
            sourceType: transaction.sourceType,
            createdAt: transaction.createdAt,
        }
    }
}
