import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Not, QueryFailedError, Repository } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { Transaction } from "../transactions/transaction.entity";
import { toTransactionDto } from "../transactions/transaction.mapper";
import { TransactionSourceType } from "../transactions/types";
import { InstallmentPlan } from "./installment-plan.entity";
import { Installment } from "./installment.entity";
import { buildInstallments, getFirstDayOfNextMonth, getInstallmentAmount } from "./installment-plan.helpers";
import { InstallmentPlanResponseDto } from "./dto/installment-plan-response.dto";
import { InstallmentResponseDto } from "./dto/installment-response.dto";
import { CreateInstallmentPlanDto } from "./dto/create-installment-plan.dto";
import { UpdateInstallmentPlanDto } from "./dto/update-installment-plan.dto";
import { PayInstallmentDto } from "./dto/pay-installment.dto";
import { PayInstallmentResponseDto } from "./dto/pay-installment-response.dto";
import { InstallmentPlanStatus, InstallmentStatus } from "./types";

const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'

type Payment = Pick<Transaction, 'id' | 'occurredOn'>

@Injectable()
export class InstallmentPlanService {

    constructor(
        @InjectRepository(InstallmentPlan)
        private installmentPlanRepository: Repository<InstallmentPlan>,
        @InjectRepository(Transaction)
        private transactionRepository: Repository<Transaction>,
        private dataSource: DataSource
    ) { }

    async findAll(userId: string): Promise<InstallmentPlanResponseDto[]> {
        const plans = await this.installmentPlanRepository.find({
            where: { userId, status: Not(InstallmentPlanStatus.CANCELLED) },
            relations: { installments: true },
            order: { createdAt: 'ASC', installments: { index: 'ASC' } }
        })
        const payments = await this.findPayments(this.transactionRepository.manager, plans.flatMap((plan) => plan.installments!))

        return plans.map((plan) => this.toDto(plan, payments))
    }

    async create(userId: string, createInstallmentPlanDto: CreateInstallmentPlanDto): Promise<InstallmentPlanResponseDto> {
        const { totalAmount, installmentCount, firstDueDate } = createInstallmentPlanDto
        if (totalAmount! < installmentCount!) {
            throw new BadRequestException(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        }
        await this.checkUserRelations(userId, createInstallmentPlanDto)

        try {
            const plan = await this.dataSource.transaction(async (manager) => {
                const plan = await manager.save(InstallmentPlan, { ...createInstallmentPlanDto, status: InstallmentPlanStatus.ACTIVE, userId })
                const installments = await manager.save(Installment, buildInstallments(totalAmount!, installmentCount!, firstDueDate!).map((installment) => ({ ...installment, planId: plan.id })))

                return { ...plan, installments }
            })

            return this.toDto(plan, new Map())
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    async update(userId: string, planId: string, updateInstallmentPlanDto: UpdateInstallmentPlanDto): Promise<InstallmentPlanResponseDto> {
        const plan = await this.findUserPlan(this.installmentPlanRepository.manager, userId, planId)
        this.checkNotCancelled(plan)
        await this.checkUserRelations(userId, updateInstallmentPlanDto)

        try {
            await this.installmentPlanRepository.update(plan.id!, { ...updateInstallmentPlanDto })
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }

        const updatedPlan = await this.findUserPlan(this.installmentPlanRepository.manager, userId, planId)

        return this.toDto(updatedPlan, await this.findPayments(this.transactionRepository.manager, updatedPlan.installments!))
    }

    async remove(userId: string, planId: string): Promise<{ message: string }> {
        const plan = await this.findUserPlan(this.installmentPlanRepository.manager, userId, planId)

        await this.installmentPlanRepository.delete(plan.id!)

        return { message: SUCCESS_MESSAGES.INSTALLMENT_PLAN.INSTALLMENT_PLAN_DELETED }
    }

    async findInstallments(userId: string, planId: string): Promise<InstallmentResponseDto[]> {
        const plan = await this.findUserPlan(this.installmentPlanRepository.manager, userId, planId)
        const payments = await this.findPayments(this.transactionRepository.manager, plan.installments!)
        const firstDayOfNextMonth = getFirstDayOfNextMonth()

        return plan.installments!.map((installment) => this.toInstallmentDto(installment, payments, firstDayOfNextMonth))
    }

    /**
     * Create the expense paying the installment, the plan row is locked so that the same installment cannot be paid twice
     */
    async pay(userId: string, planId: string, installmentId: string, { occurredOn, accountId }: PayInstallmentDto): Promise<PayInstallmentResponseDto> {
        try {
            return await this.dataSource.transaction(async (manager) => {
                const plan = await manager.findOne(InstallmentPlan, { where: { id: planId, userId }, lock: { mode: 'pessimistic_write' } })

                if (!plan) {
                    throw new NotFoundException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND)
                }
                this.checkNotCancelled(plan)

                const installment = await manager.findOne(Installment, { where: { id: installmentId, planId: plan.id } })
                if (!installment) {
                    throw new NotFoundException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_NOT_FOUND)
                }
                if (await manager.exists(Transaction, { where: { installmentId: installment.id } })) {
                    throw new ConflictException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_ALREADY_PAID)
                }

                const debitedAccountId = accountId ?? plan.accountId
                if (!debitedAccountId) {
                    throw new BadRequestException(ERRORS_MESSAGES.INSTALLMENT_PLANS.ACCOUNT_REQUIRED)
                }
                if (accountId && !(await manager.exists(Account, { where: { id: accountId, userId } }))) {
                    throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
                }

                const transaction = await manager.save(Transaction, {
                    amount: -installment.amount!,
                    occurredOn,
                    merchant: plan.label,
                    accountId: debitedAccountId,
                    categoryId: plan.categoryId,
                    sourceType: TransactionSourceType.INSTALLMENT,
                    installmentId: installment.id,
                    userId,
                })

                return {
                    installment: this.toInstallmentDto(installment, new Map([[installment.id!, transaction]]), getFirstDayOfNextMonth()),
                    transaction: toTransactionDto(transaction),
                }
            })
        } catch (err) {
            if (err instanceof QueryFailedError && err.driverError.code === UNIQUE_VIOLATION) {
                throw new ConflictException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_ALREADY_PAID)
            }
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    private async findUserPlan(manager: EntityManager, userId: string, planId: string): Promise<InstallmentPlan> {
        const plan = await manager.findOne(InstallmentPlan, {
            where: { id: planId, userId },
            relations: { installments: true },
            order: { installments: { index: 'ASC' } }
        })

        if (!plan) {
            throw new NotFoundException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND)
        }

        return plan
    }

    /**
     * Transactions paying the given installments, by installment id
     */
    private async findPayments(manager: EntityManager, installments: Installment[]): Promise<Map<string, Payment>> {
        if (!installments.length) return new Map()

        const transactions = await manager.find(Transaction, {
            select: { id: true, occurredOn: true, installmentId: true },
            where: { installmentId: In(installments.map((installment) => installment.id!)) }
        })

        return new Map(transactions.map((transaction) => [transaction.installmentId!, transaction]))
    }

    private checkNotCancelled(plan: InstallmentPlan): void {
        if (plan.status === InstallmentPlanStatus.CANCELLED) {
            throw new ConflictException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_CANCELLED)
        }
    }

    private async checkUserRelations(userId: string, { accountId, categoryId }: { accountId?: string | null, categoryId?: string | null }): Promise<void> {
        const { manager } = this.installmentPlanRepository

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
            if (detail.includes('installmentId') || detail.includes('planId')) {
                throw new NotFoundException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_NOT_FOUND)
            }
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        }
    }

    private toInstallmentDto(installment: Installment, payments: Map<string, Payment>, firstDayOfNextMonth: string): InstallmentResponseDto {
        const payment = payments.get(installment.id!)
        const status = payment
            ? InstallmentStatus.PAID
            : installment.dueDate! < firstDayOfNextMonth ? InstallmentStatus.DUE : InstallmentStatus.FUTURE

        return {
            id: installment.id,
            index: installment.index,
            dueDate: installment.dueDate,
            amount: installment.amount,
            status,
            transactionId: payment?.id ?? null,
            paidOn: payment?.occurredOn ?? null,
        }
    }

    private toDto(plan: InstallmentPlan, payments: Map<string, Payment>): InstallmentPlanResponseDto {
        const firstDayOfNextMonth = getFirstDayOfNextMonth()
        const unpaidInstallments = plan.installments!.filter((installment) => !payments.has(installment.id!))
        const nextInstallment = unpaidInstallments[0]
        const status = plan.status === InstallmentPlanStatus.CANCELLED
            ? InstallmentPlanStatus.CANCELLED
            : unpaidInstallments.length ? InstallmentPlanStatus.ACTIVE : InstallmentPlanStatus.COMPLETED

        return {
            id: plan.id,
            label: plan.label,
            provider: plan.provider ?? null,
            totalAmount: plan.totalAmount,
            installmentCount: plan.installmentCount,
            installmentAmount: getInstallmentAmount(plan.totalAmount!, plan.installmentCount!),
            firstDueDate: plan.firstDueDate,
            status,
            paidCount: plan.installments!.length - unpaidInstallments.length,
            remainingDue: unpaidInstallments.reduce((sum, installment) => sum + installment.amount!, 0),
            nextInstallment: nextInstallment ? this.toInstallmentDto(nextInstallment, payments, firstDayOfNextMonth) : null,
            accountId: plan.accountId ?? null,
            categoryId: plan.categoryId ?? null,
            createdAt: plan.createdAt,
        }
    }
}
