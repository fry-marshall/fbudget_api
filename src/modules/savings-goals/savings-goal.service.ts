import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { MoreThan, Not, QueryFailedError, Repository } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionResponseDto } from "../transactions/dto/transaction-response.dto";
import { toTransactionDto } from "../transactions/transaction.mapper";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { SavingsGoal } from "./savings-goal.entity";
import { getProgressPct } from "src/common/helpers/helpers";
import { getProjectedMonth } from "./savings-goal.helpers";
import { SavingsGoalResponseDto } from "./dto/savings-goal-response.dto";
import { CreateSavingsGoalDto } from "./dto/create-savings-goal.dto";
import { UpdateSavingsGoalDto } from "./dto/update-savings-goal.dto";
import { ContributeSavingsGoalDto } from "./dto/contribute-savings-goal.dto";
import { ContributeSavingsGoalResponseDto } from "./dto/contribute-savings-goal-response.dto";

const FOREIGN_KEY_VIOLATION = '23503'

@Injectable()
export class SavingsGoalService {

    constructor(
        @InjectRepository(SavingsGoal)
        private savingsGoalRepository: Repository<SavingsGoal>,
        @InjectRepository(Transaction)
        private transactionRepository: Repository<Transaction>,
    ) { }

    async findAll(userId: string): Promise<SavingsGoalResponseDto[]> {
        const savingsGoals = await this.savingsGoalRepository.find({
            where: { userId },
            order: { createdAt: 'ASC' }
        })
        const currentAmounts = await this.findCurrentAmounts(userId, savingsGoals.map((savingsGoal) => savingsGoal.id!))

        return savingsGoals.map((savingsGoal) => this.toDto(savingsGoal, currentAmounts.get(savingsGoal.id!) ?? 0))
    }

    async create(userId: string, createSavingsGoalDto: CreateSavingsGoalDto): Promise<SavingsGoalResponseDto> {
        this.checkTargetDate(createSavingsGoalDto.targetAmount ?? null, createSavingsGoalDto.targetDate ?? null)
        await this.checkUserAccount(userId, createSavingsGoalDto.accountId)

        try {
            const savingsGoal = await this.savingsGoalRepository.save({ ...createSavingsGoalDto, userId })

            return this.toDto(savingsGoal, 0)
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    async update(userId: string, savingsGoalId: string, updateSavingsGoalDto: UpdateSavingsGoalDto): Promise<SavingsGoalResponseDto> {
        const savingsGoal = await this.findUserSavingsGoal(userId, savingsGoalId)
        this.checkTargetDate(
            updateSavingsGoalDto.targetAmount !== undefined ? updateSavingsGoalDto.targetAmount : savingsGoal.targetAmount ?? null,
            updateSavingsGoalDto.targetDate !== undefined ? updateSavingsGoalDto.targetDate : savingsGoal.targetDate ?? null,
        )
        await this.checkUserAccount(userId, updateSavingsGoalDto.accountId)

        try {
            await this.savingsGoalRepository.update(savingsGoal.id!, { ...updateSavingsGoalDto })
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }

        const updatedSavingsGoal = await this.findUserSavingsGoal(userId, savingsGoalId)
        const currentAmounts = await this.findCurrentAmounts(userId, [updatedSavingsGoal.id!])

        return this.toDto(updatedSavingsGoal, currentAmounts.get(updatedSavingsGoal.id!) ?? 0)
    }

    async remove(userId: string, savingsGoalId: string): Promise<{ message: string }> {
        const savingsGoal = await this.findUserSavingsGoal(userId, savingsGoalId)

        await this.savingsGoalRepository.delete(savingsGoal.id!)

        return { message: SUCCESS_MESSAGES.SAVINGS_GOAL.SAVINGS_GOAL_DELETED }
    }

    /**
     * Put money aside for the savings goal from the account of the body, the primary account by default.
     * A transfer to the savings account of the goal when it has one other than the primary account, a simple debit otherwise. Returns the debit of the source account
     */
    async contribute(userId: string, savingsGoalId: string, { amount, occurredOn, accountId }: ContributeSavingsGoalDto): Promise<ContributeSavingsGoalResponseDto> {
        const savingsGoal = await this.findUserSavingsGoal(userId, savingsGoalId)
        await this.checkUserAccount(userId, accountId)

        const primaryAccountId = (await this.savingsGoalRepository.manager.findOne(Account, { select: { id: true }, where: { userId, isPrimary: true } }))?.id
        const sourceAccountId = accountId ?? primaryAccountId
        if (!sourceAccountId) {
            throw new BadRequestException(ERRORS_MESSAGES.SAVINGS_GOALS.ACCOUNT_REQUIRED)
        }
        // As for the monthly generation, a goal saved on the primary account has no savings account to transfer to
        const savingsAccountId = savingsGoal.accountId && savingsGoal.accountId !== primaryAccountId ? savingsGoal.accountId : null
        if (sourceAccountId === savingsAccountId) {
            throw new BadRequestException(ERRORS_MESSAGES.SAVINGS_GOALS.SOURCE_IS_SAVINGS_ACCOUNT)
        }

        const contribution = { occurredOn, merchant: savingsGoal.label, status: TransactionStatus.CONFIRMED, savingsGoalId: savingsGoal.id, userId }

        const transferLeg = { ...contribution, sourceType: TransactionSourceType.TRANSFER, transferId: randomUUID() }

        try {
            const [debit] = await this.transactionRepository.manager.transaction((manager) => manager.save(Transaction, savingsAccountId
                ? [
                    { ...transferLeg, amount: -amount!, accountId: sourceAccountId },
                    { ...transferLeg, amount: amount!, accountId: savingsAccountId },
                ]
                : [{ ...contribution, sourceType: TransactionSourceType.SAVINGS, amount: -amount!, accountId: sourceAccountId }]
            ))
            const currentAmounts = await this.findCurrentAmounts(userId, [savingsGoal.id!])

            return {
                savingsGoal: this.toDto(savingsGoal, currentAmounts.get(savingsGoal.id!) ?? 0),
                transaction: toTransactionDto(debit),
            }
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    async findContributions(userId: string, savingsGoalId: string): Promise<TransactionResponseDto[]> {
        const savingsGoal = await this.findUserSavingsGoal(userId, savingsGoalId)

        const transactions = await this.transactionRepository.find({
            // One row per contribution: the credit of the savings account for a transfer, the debit otherwise
            where: [
                { savingsGoalId: savingsGoal.id, userId, sourceType: Not(TransactionSourceType.TRANSFER) },
                { savingsGoalId: savingsGoal.id, userId, sourceType: TransactionSourceType.TRANSFER, amount: MoreThan(0) },
            ],
            order: { occurredOn: 'DESC', createdAt: 'DESC' }
        })

        return transactions.map(toTransactionDto)
    }

    private async findUserSavingsGoal(userId: string, savingsGoalId: string): Promise<SavingsGoal> {
        const savingsGoal = await this.savingsGoalRepository.findOne({ where: { id: savingsGoalId, userId } })

        if (!savingsGoal) {
            throw new NotFoundException(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
        }

        return savingsGoal
    }

    /**
     * Sum of the confirmed contributions of each savings goal in one query: the credit of the savings account for a transfer, minus the debit for a simple contribution
     */
    private async findCurrentAmounts(userId: string, savingsGoalIds: string[]): Promise<Map<string, number>> {
        if (!savingsGoalIds.length) {
            return new Map()
        }

        const rows = await this.transactionRepository.createQueryBuilder('transaction')
            .select('transaction.savingsGoalId', 'savingsGoalId')
            .addSelect('COALESCE(SUM(CASE WHEN transaction.sourceType = :transfer THEN GREATEST(transaction.amount, 0) ELSE -transaction.amount END), 0)', 'currentAmount')
            .setParameter('transfer', TransactionSourceType.TRANSFER)
            .where('transaction.userId = :userId', { userId })
            .andWhere('transaction.savingsGoalId IN (:...savingsGoalIds)', { savingsGoalIds })
            .andWhere('transaction.status = :status', { status: TransactionStatus.CONFIRMED })
            .groupBy('transaction.savingsGoalId')
            .getRawMany<{ savingsGoalId: string, currentAmount: string }>()

        return new Map(rows.map(({ savingsGoalId, currentAmount }) => [savingsGoalId, Number(currentAmount)]))
    }

    private checkTargetDate(targetAmount: number | null, targetDate: string | null): void {
        if (targetDate !== null && targetAmount === null) {
            throw new BadRequestException(ERRORS_MESSAGES.SAVINGS_GOALS.TARGET_AMOUNT_REQUIRED)
        }
    }

    private async checkUserAccount(userId: string, accountId?: string | null): Promise<void> {
        if (accountId && !(await this.savingsGoalRepository.manager.exists(Account, { where: { id: accountId, userId } }))) {
            throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        }
    }

    /**
     * The user, the account or the savings goal may be deleted between the checks and the write
     */
    private handleForeignKeyViolation(err: unknown): void {
        if (err instanceof QueryFailedError && err.driverError.code === FOREIGN_KEY_VIOLATION) {
            const detail = String(err.driverError.detail)

            if (detail.includes('accountId')) {
                throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            }
            if (detail.includes('savingsGoalId')) {
                throw new NotFoundException(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
            }
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        }
    }

    private toDto(savingsGoal: SavingsGoal, currentAmount: number): SavingsGoalResponseDto {
        const targetAmount = savingsGoal.targetAmount ?? null

        return {
            id: savingsGoal.id,
            label: savingsGoal.label,
            monthlyContribution: savingsGoal.monthlyContribution,
            targetAmount,
            targetDate: savingsGoal.targetDate ?? null,
            dayOfMonth: savingsGoal.dayOfMonth ?? null,
            hasGoal: targetAmount !== null,
            currentAmount,
            progressPct: getProgressPct(currentAmount, targetAmount),
            projectedMonth: getProjectedMonth(currentAmount, targetAmount, savingsGoal.monthlyContribution!),
            accountId: savingsGoal.accountId ?? null,
            createdAt: savingsGoal.createdAt,
        }
    }
}
