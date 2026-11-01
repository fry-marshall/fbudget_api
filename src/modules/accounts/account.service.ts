import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { User } from "../users/user.entity";
import { Account } from "./account.entity";
import { AccountResponseDto } from "./dto/account-response.dto";
import { CreateAccountDto } from "./dto/create-account.dto";
import { UpdateAccountDto } from "./dto/update-account.dto";
import { AccountBalanceResponseDto } from "./dto/account-balance-response.dto";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionStatus } from "../transactions/types";

// The primary account funds the other accounts, its own monthly funding is dropped when it becomes primary
const NEW_PRIMARY_ACCOUNT = { isPrimary: true, monthlyFunding: null, monthlyFundingDay: null }

@Injectable()
export class AccountService {

    constructor(
        @InjectRepository(Account)
        private accountRepository: Repository<Account>,
        @InjectRepository(Transaction)
        private transactionRepository: Repository<Transaction>,
        private dataSource: DataSource
    ) { }

    async findAll(userId: string): Promise<AccountResponseDto[]> {
        const accounts = await this.accountRepository.find({
            where: { userId },
            order: { createdAt: 'ASC' }
        })

        return accounts.map((account) => this.toDto(account))
    }

    async create(userId: string, createAccountDto: CreateAccountDto): Promise<AccountResponseDto> {
        const account = await this.dataSource.transaction(async (manager) => {
            await this.lockUser(manager, userId, ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)

            const isPrimary = !(await manager.exists(Account, { where: { userId } }))
            this.checkMonthlyFunding(isPrimary, createAccountDto.monthlyFunding ?? null, createAccountDto.monthlyFundingDay ?? null)

            return manager.save(Account, { ...createAccountDto, userId, isPrimary })
        })

        return this.toDto(account)
    }

    async update(userId: string, accountId: string, updateAccountDto: UpdateAccountDto): Promise<AccountResponseDto> {
        const account = await this.findUserAccount(this.accountRepository.manager, userId, accountId)
        this.checkMonthlyFunding(
            account.isPrimary!,
            updateAccountDto.monthlyFunding !== undefined ? updateAccountDto.monthlyFunding : account.monthlyFunding ?? null,
            updateAccountDto.monthlyFundingDay !== undefined ? updateAccountDto.monthlyFundingDay : account.monthlyFundingDay ?? null,
        )

        await this.accountRepository.update(account.id!, { ...updateAccountDto })

        return this.toDto((await this.accountRepository.findOneBy({ id: account.id }))!)
    }

    async getBalance(userId: string, accountId: string): Promise<AccountBalanceResponseDto> {
        const account = await this.findUserAccount(this.accountRepository.manager, userId, accountId)

        const { total } = (await this.transactionRepository.createQueryBuilder('transaction')
            .select('COALESCE(SUM(transaction.amount), 0)', 'total')
            .where('transaction.accountId = :accountId', { accountId: account.id })
            .andWhere('transaction.status = :status', { status: TransactionStatus.CONFIRMED })
            .getRawOne<{ total: string }>())!

        return {
            accountId: account.id,
            initialBalance: account.initialBalance,
            balance: account.initialBalance! + Number(total),
        }
    }

    async setPrimary(userId: string, accountId: string): Promise<AccountResponseDto> {
        const account = await this.dataSource.transaction(async (manager) => {
            await this.lockUser(manager, userId, ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            const account = await this.findUserAccount(manager, userId, accountId)

            await manager.update(Account, { userId, isPrimary: true }, { isPrimary: false })
            await manager.update(Account, account.id!, NEW_PRIMARY_ACCOUNT)

            return manager.findOneByOrFail(Account, { id: account.id })
        })

        return this.toDto(account)
    }

    async remove(userId: string, accountId: string): Promise<{ message: string }> {
        await this.dataSource.transaction(async (manager) => {
            await this.lockUser(manager, userId, ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            const account = await this.findUserAccount(manager, userId, accountId)

            await manager.delete(Account, account.id!)

            if (account.isPrimary) {
                const oldestAccount = await manager.findOne(Account, { where: { userId }, order: { createdAt: 'ASC' } })

                if (oldestAccount) {
                    await manager.update(Account, oldestAccount.id!, NEW_PRIMARY_ACCOUNT)
                }
            }
        })

        return { message: SUCCESS_MESSAGES.ACCOUNT.ACCOUNT_DELETED }
    }

    private checkMonthlyFunding(isPrimary: boolean, monthlyFunding: number | null, monthlyFundingDay: number | null): void {
        if (isPrimary && monthlyFunding !== null) {
            throw new BadRequestException(ERRORS_MESSAGES.ACCOUNTS.PRIMARY_ACCOUNT_FUNDING)
        }
        if (monthlyFundingDay !== null && monthlyFunding === null) {
            throw new BadRequestException(ERRORS_MESSAGES.ACCOUNTS.MONTHLY_FUNDING_REQUIRED)
        }
    }

    private async lockUser(manager: EntityManager, userId: string, notFoundMessage: string): Promise<void> {
        const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } })

        if (!user) {
            throw new NotFoundException(notFoundMessage)
        }
    }

    private async findUserAccount(manager: EntityManager, userId: string, accountId: string): Promise<Account> {
        const account = await manager.findOne(Account, { where: { id: accountId, userId } })

        if (!account) {
            throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        }

        return account
    }

    private toDto(account: Account): AccountResponseDto {
        return {
            id: account.id,
            type: account.type,
            operator: account.operator ?? null,
            name: account.name,
            last4: account.last4 ?? null,
            country: account.country ?? null,
            initialBalance: account.initialBalance,
            isPrimary: account.isPrimary,
            monthlyFunding: account.monthlyFunding ?? null,
            monthlyFundingDay: account.monthlyFundingDay ?? null,
            createdAt: account.createdAt,
        }
    }
}
