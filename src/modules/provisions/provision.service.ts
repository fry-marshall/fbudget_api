import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, QueryFailedError, Repository } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { addMonthsToDate } from "src/common/helpers/helpers";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionResponseDto } from "../transactions/dto/transaction-response.dto";
import { toTransactionDto } from "../transactions/transaction.mapper";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { Provision } from "./provision.entity";
import { ProvisionResponseDto } from "./dto/provision-response.dto";
import { CreateProvisionDto } from "./dto/create-provision.dto";
import { UpdateProvisionDto } from "./dto/update-provision.dto";
import { SettleProvisionDto } from "./dto/settle-provision.dto";
import { SettleProvisionResponseDto } from "./dto/settle-provision-response.dto";
import { ProvisionStatus } from "./types";

const FOREIGN_KEY_VIOLATION = '23503'

@Injectable()
export class ProvisionService {

    constructor(
        @InjectRepository(Provision)
        private provisionRepository: Repository<Provision>,
        @InjectRepository(Transaction)
        private transactionRepository: Repository<Transaction>,
        private dataSource: DataSource
    ) { }

    async findAll(userId: string): Promise<ProvisionResponseDto[]> {
        const provisions = await this.provisionRepository.find({
            where: { userId, status: In([ProvisionStatus.ACTIVE, ProvisionStatus.PAUSED]) },
            order: { nextDueDate: 'ASC', createdAt: 'ASC' }
        })

        return provisions.map((provision) => this.toDto(provision))
    }

    async create(userId: string, createProvisionDto: CreateProvisionDto): Promise<ProvisionResponseDto> {
        await this.checkUserRelations(userId, createProvisionDto)

        try {
            const provision = await this.provisionRepository.save({ ...createProvisionDto, status: ProvisionStatus.ACTIVE, userId })

            return this.toDto(provision)
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    async update(userId: string, provisionId: string, updateProvisionDto: UpdateProvisionDto): Promise<ProvisionResponseDto> {
        const provision = await this.findUserProvision(userId, provisionId)
        this.checkNotCancelled(provision)
        await this.checkUserRelations(userId, updateProvisionDto)

        try {
            await this.provisionRepository.update(provision.id!, { ...updateProvisionDto })
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }

        return this.toDto((await this.provisionRepository.findOneBy({ id: provision.id }))!)
    }

    async remove(userId: string, provisionId: string): Promise<{ message: string }> {
        const provision = await this.findUserProvision(userId, provisionId)

        await this.provisionRepository.delete(provision.id!)

        return { message: SUCCESS_MESSAGES.PROVISION.PROVISION_DELETED }
    }

    /**
     * Record the payment of the current due date as an expense and move the due date forward, in one DB transaction
     */
    async settle(userId: string, provisionId: string, { occurredOn, amount, accountId }: SettleProvisionDto): Promise<SettleProvisionResponseDto> {
        try {
            return await this.dataSource.transaction(async (manager) => {
                const provision = await manager.findOne(Provision, { where: { id: provisionId, userId }, lock: { mode: 'pessimistic_write' } })

                if (!provision) {
                    throw new NotFoundException(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND)
                }
                this.checkNotCancelled(provision)

                const debitedAccountId = accountId ?? provision.accountId
                if (!debitedAccountId) {
                    throw new BadRequestException(ERRORS_MESSAGES.PROVISIONS.ACCOUNT_REQUIRED)
                }
                if (accountId && !(await manager.exists(Account, { where: { id: accountId, userId } }))) {
                    throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
                }

                const transaction = await manager.save(Transaction, {
                    amount: -(amount ?? provision.totalAmount!),
                    occurredOn,
                    merchant: provision.label,
                    accountId: debitedAccountId,
                    categoryId: provision.categoryId,
                    sourceType: TransactionSourceType.PROVISION,
                    status: TransactionStatus.CONFIRMED,
                    provisionId: provision.id,
                    userId,
                })

                const nextDueDate = addMonthsToDate(provision.nextDueDate!, provision.frequencyMonths!)
                await manager.update(Provision, provision.id!, { nextDueDate })

                return {
                    provision: this.toDto({ ...provision, nextDueDate }),
                    transaction: toTransactionDto(transaction),
                }
            })
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    async findSettlements(userId: string, provisionId: string): Promise<TransactionResponseDto[]> {
        const provision = await this.findUserProvision(userId, provisionId)

        const transactions = await this.transactionRepository.find({
            where: { provisionId: provision.id, userId },
            order: { occurredOn: 'DESC', createdAt: 'DESC' }
        })

        return transactions.map(toTransactionDto)
    }

    private async findUserProvision(userId: string, provisionId: string): Promise<Provision> {
        const provision = await this.provisionRepository.findOne({ where: { id: provisionId, userId } })

        if (!provision) {
            throw new NotFoundException(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND)
        }

        return provision
    }

    private checkNotCancelled(provision: Provision): void {
        if (provision.status === ProvisionStatus.CANCELLED) {
            throw new ConflictException(ERRORS_MESSAGES.PROVISIONS.PROVISION_CANCELLED)
        }
    }

    private async checkUserRelations(userId: string, { accountId, categoryId }: { accountId?: string | null, categoryId?: string | null }): Promise<void> {
        const { manager } = this.provisionRepository

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

    private toDto(provision: Provision): ProvisionResponseDto {
        return {
            id: provision.id,
            label: provision.label,
            totalAmount: provision.totalAmount,
            frequencyMonths: provision.frequencyMonths,
            monthlyAmount: Math.ceil(provision.totalAmount! / provision.frequencyMonths!),
            nextDueDate: provision.nextDueDate,
            startedAt: provision.startedAt,
            status: provision.status,
            accountId: provision.accountId ?? null,
            categoryId: provision.categoryId ?? null,
            createdAt: provision.createdAt,
        }
    }
}
