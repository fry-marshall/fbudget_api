import { Injectable, Logger } from "@nestjs/common";
import { DataSource, EntityManager, EntityTarget, In, LessThan } from "typeorm";
import { addMonthsToDate } from "src/common/helpers/helpers";
import { Account } from "../accounts/account.entity";
import { FixedCharge } from "../fixed-charges/fixed-charge.entity";
import { Income } from "../incomes/income.entity";
import { InstallmentPlan } from "../installment-plans/installment-plan.entity";
import { Provision } from "../provisions/provision.entity";
import { SavingsGoal } from "../savings-goals/savings-goal.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionStatus } from "../transactions/types";
import { User } from "../users/user.entity";
import { computePlannedTransactions, getPreviousMonthStart, toPendingTransactions } from "./planning.helpers";
import { GeneratedRule, PlannedSource, PlannedTransaction, PlanningRules } from "./types";

@Injectable()
export class PlanningService {

    private readonly logger = new Logger(PlanningService.name)

    constructor(
        private dataSource: DataSource
    ) { }

    /**
     * Daily run: purge the unpaid pending transactions, then generate the pending transactions of the month for every user with a primary account.
     * A failure on a user is logged and does not stop the others
     */
    async generateAll(today: Date = new Date()): Promise<void> {
        try {
            const purged = await this.purgeStalePending(today)
            this.logger.log(`${purged} stale pending transactions purged`)
        } catch (err) {
            this.logger.error('Purge of the stale pending transactions failed', err instanceof Error ? err.stack : String(err))
        }

        const userIds = await this.findUserIdsWithPrimaryAccount()
        let generated = 0
        let failed = 0

        for (const userId of userIds) {
            try {
                generated += await this.generateForUser(userId, today)
            } catch (err) {
                failed++
                this.logger.error(`Generation of the planned transactions failed for user ${userId}`, err instanceof Error ? err.stack : String(err))
            }
        }

        this.logger.log(`${generated} pending transactions generated for ${userIds.length} users, ${failed} failed`)
    }

    /**
     * Save as pending the planned transactions of the month of the rules not generated yet this month, then move their cursor to the month.
     * A rule which generated nothing stays open and is evaluated again the next day, the next due date of a generated provision payment moves forward.
     * Returns the number of saved transactions
     */
    async generateForUser(userId: string, today: Date = new Date()): Promise<number> {
        const month = today.toISOString().slice(0, 7)

        return this.dataSource.transaction(async (manager) => {
            // Two runs for the same user wait for each other instead of generating twice
            const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } })
            if (!user) return 0

            const rules = await this.findRules(manager, userId)
            if (!rules.accounts.some((account) => account.isPrimary)) return 0

            const planned = computePlannedTransactions(month, rules)
            const paidInstallmentIds = await this.findPaidInstallmentIds(manager, planned)
            const toGenerate = planned
                .map((plannedTransaction) => ({ planned: plannedTransaction, ...this.findRule(plannedTransaction, rules) }))
                .filter(({ planned, rule }) => !this.isGenerated(rule, month) && !paidInstallmentIds.has(planned.sourceId))

            if (!toGenerate.length) return 0

            const transactions = await manager.save(Transaction, toPendingTransactions(toGenerate.map(({ planned }) => planned), userId))

            const ruleIdsByEntity = new Map<EntityTarget<GeneratedRule>, Set<string>>()
            for (const { entity, rule } of toGenerate) {
                ruleIdsByEntity.set(entity, (ruleIdsByEntity.get(entity) ?? new Set()).add(rule.id!))
            }
            for (const [entity, ids] of ruleIdsByEntity) {
                await manager.update(entity, { id: In([...ids]) }, { lastGeneratedMonth: month })
            }

            // The payment of a provision is planned once: its next due date moves forward as soon as it is generated
            for (const { planned: { source }, rule } of toGenerate) {
                if (source === PlannedSource.PROVISION_PAYMENT) {
                    const { nextDueDate, frequencyMonths } = rule as Provision
                    await manager.update(Provision, rule.id!, { nextDueDate: addMonthsToDate(nextDueDate!, frequencyMonths!) })
                }
            }

            return transactions.length
        })
    }

    /**
     * Delete the pending transactions dated before the previous month: they were not paid. Returns the number of deleted transactions
     */
    async purgeStalePending(today: Date = new Date()): Promise<number> {
        const { affected } = await this.dataSource.getRepository(Transaction).delete({
            status: TransactionStatus.PENDING,
            occurredOn: LessThan(getPreviousMonthStart(today)),
        })

        return affected ?? 0
    }

    private async findUserIdsWithPrimaryAccount(): Promise<string[]> {
        const accounts = await this.dataSource.getRepository(Account).find({ select: { userId: true }, where: { isPrimary: true } })

        return [...new Set(accounts.map(({ userId }) => userId!))]
    }

    private async findRules(manager: EntityManager, userId: string): Promise<PlanningRules> {
        const [accounts, incomes, fixedCharges, installmentPlans, provisions, savingsGoals] = await Promise.all([
            manager.find(Account, { where: { userId } }),
            manager.find(Income, { where: { userId } }),
            manager.find(FixedCharge, { where: { userId } }),
            manager.find(InstallmentPlan, { where: { userId }, relations: { installments: true } }),
            manager.find(Provision, { where: { userId } }),
            manager.find(SavingsGoal, { where: { userId } }),
        ])

        return { accounts, incomes, fixedCharges, installmentPlans, provisions, savingsGoals }
    }

    /**
     * Installments of the month already paid by a transaction, the unique index forbids to generate another one
     */
    private async findPaidInstallmentIds(manager: EntityManager, planned: PlannedTransaction[]): Promise<Set<string>> {
        const installmentIds = planned.filter(({ source }) => source === PlannedSource.INSTALLMENT).map(({ sourceId }) => sourceId)
        if (!installmentIds.length) return new Set()

        const transactions = await manager.find(Transaction, { select: { installmentId: true }, where: { installmentId: In(installmentIds) } })

        return new Set(transactions.map(({ installmentId }) => installmentId!))
    }

    /**
     * Rule holding the generation cursor of a planned transaction: the plan of an installment, the funded account of an account funding
     */
    private findRule({ source, sourceId }: PlannedTransaction, rules: PlanningRules): { entity: EntityTarget<GeneratedRule>, rule: GeneratedRule } {
        switch (source) {
            case PlannedSource.INCOME:
                return { entity: Income, rule: rules.incomes.find(({ id }) => id === sourceId)! }
            case PlannedSource.FIXED_CHARGE:
                return { entity: FixedCharge, rule: rules.fixedCharges.find(({ id }) => id === sourceId)! }
            case PlannedSource.INSTALLMENT:
                return { entity: InstallmentPlan, rule: rules.installmentPlans.find(({ installments }) => installments?.some(({ id }) => id === sourceId))! }
            case PlannedSource.PROVISION_TRANSFER:
            case PlannedSource.PROVISION_PAYMENT:
                return { entity: Provision, rule: rules.provisions.find(({ id }) => id === sourceId)! }
            case PlannedSource.SAVINGS:
                return { entity: SavingsGoal, rule: rules.savingsGoals.find(({ id }) => id === sourceId)! }
            case PlannedSource.ACCOUNT_FUNDING:
                return { entity: Account, rule: rules.accounts.find(({ id }) => id === sourceId)! }
        }
    }

    private isGenerated({ lastGeneratedMonth }: GeneratedRule, month: string): boolean {
        return lastGeneratedMonth != null && lastGeneratedMonth >= month
    }
}
