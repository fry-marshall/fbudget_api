import { randomUUID } from "crypto";
import { DeepPartial } from "typeorm";
import { Income } from "../incomes/income.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { InstallmentPlanStatus } from "../installment-plans/types";
import { getMonthlyAmount } from "../provisions/provision.helpers";
import { ProvisionStatus } from "../provisions/types";
import { PlannedSource, PlannedTransaction, PlanningRules } from "./types";

/**
 * Day of a YYYY-MM month as YYYY-MM-DD, a day missing in the month becomes its last day (31 → 2027-02-28)
 */
export const getDateInMonth = (month: string, day: number): string => {
    const [year, monthIndex] = month.split('-').map(Number)
    // Day 0 of the following month is the last day of the month
    const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()

    return `${month}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}`
}

/**
 * Day of the main fixed income credited on the primary account, the monthly transfers are planned on it, the 1st without such income
 */
export const getReferenceDay = (incomes: Income[], primaryAccountId: string | null): number => {
    const [reference] = incomes
        .filter((income) => !income.isVariable && income.dayOfMonth != null && primaryAccountId !== null && (income.accountId ?? primaryAccountId) === primaryAccountId)
        .sort((a, b) => b.amount! - a.amount! || a.dayOfMonth! - b.dayOfMonth!)

    return reference?.dayOfMonth ?? 1
}

/**
 * Nothing is planned before a rule exists: a rule created after its day of the month starts the next month
 */
const existsOn = (createdAt: Date | undefined, occurredOn: string): boolean => !createdAt || createdAt.toISOString().slice(0, 10) <= occurredOn

/**
 * Everything expected on the accounts of the user in a month, from their rules, sorted by date.
 * Pure: the generation cursors are not taken into account, rules without a resolvable account are skipped
 */
export const computePlannedTransactions = (month: string, { accounts, incomes, fixedCharges, installmentPlans, provisions, savingsGoals }: PlanningRules): PlannedTransaction[] => {
    const primaryAccountId = accounts.find((account) => account.isPrimary)?.id ?? null
    const referenceDate = getDateInMonth(month, getReferenceDay(incomes, primaryAccountId))
    const planned: PlannedTransaction[] = []
    // A transfer only makes sense from the primary account to another account
    const isFundedAccount = (accountId: string | null | undefined): accountId is string => !!accountId && primaryAccountId !== null && accountId !== primaryAccountId

    for (const income of incomes) {
        const accountId = income.accountId ?? primaryAccountId
        const occurredOn = getDateInMonth(month, income.dayOfMonth ?? 1)
        if (accountId && existsOn(income.createdAt, occurredOn)) {
            planned.push({ source: PlannedSource.INCOME, sourceId: income.id!, label: income.label!, amount: income.amount!, occurredOn, accountId })
        }
    }

    for (const fixedCharge of fixedCharges) {
        const accountId = fixedCharge.accountId ?? primaryAccountId
        const occurredOn = getDateInMonth(month, fixedCharge.dayOfMonth!)
        if (accountId && existsOn(fixedCharge.createdAt, occurredOn)) {
            planned.push({ source: PlannedSource.FIXED_CHARGE, sourceId: fixedCharge.id!, label: fixedCharge.label!, amount: -fixedCharge.amount!, occurredOn, accountId, categoryId: fixedCharge.categoryId })
        }
    }

    for (const installmentPlan of installmentPlans) {
        const accountId = installmentPlan.accountId ?? primaryAccountId
        if (installmentPlan.status !== InstallmentPlanStatus.ACTIVE || !accountId) continue

        for (const installment of installmentPlan.installments ?? []) {
            if (installment.dueDate!.startsWith(month)) {
                planned.push({
                    source: PlannedSource.INSTALLMENT,
                    sourceId: installment.id!,
                    label: `${installmentPlan.label} ${installment.index}/${installmentPlan.installmentCount}`,
                    amount: -installment.amount!,
                    occurredOn: installment.dueDate!,
                    accountId,
                    categoryId: installmentPlan.categoryId,
                })
            }
        }
    }

    for (const provision of provisions) {
        if (provision.status !== ProvisionStatus.ACTIVE) continue

        // Without a dedicated account the money stays on the primary account: the monthly amount is only reserved by the budget
        if (isFundedAccount(provision.accountId) && provision.startedAt! <= referenceDate) {
            planned.push({ source: PlannedSource.PROVISION_TRANSFER, sourceId: provision.id!, label: provision.label!, amount: getMonthlyAmount(provision.totalAmount!, provision.frequencyMonths!), occurredOn: referenceDate, accountId: primaryAccountId!, toAccountId: provision.accountId })
        }

        const paymentAccountId = provision.accountId ?? primaryAccountId
        if (provision.nextDueDate!.startsWith(month) && paymentAccountId) {
            planned.push({ source: PlannedSource.PROVISION_PAYMENT, sourceId: provision.id!, label: provision.label!, amount: -provision.totalAmount!, occurredOn: provision.nextDueDate!, accountId: paymentAccountId, categoryId: provision.categoryId })
        }
    }

    for (const savingsGoal of savingsGoals) {
        const occurredOn = savingsGoal.dayOfMonth != null ? getDateInMonth(month, savingsGoal.dayOfMonth) : referenceDate
        if (!primaryAccountId || !existsOn(savingsGoal.createdAt, occurredOn)) continue

        // Without a savings account in the app the money leaves the primary account
        planned.push(isFundedAccount(savingsGoal.accountId)
            ? { source: PlannedSource.SAVINGS, sourceId: savingsGoal.id!, label: savingsGoal.label!, amount: savingsGoal.monthlyContribution!, occurredOn, accountId: primaryAccountId, toAccountId: savingsGoal.accountId }
            : { source: PlannedSource.SAVINGS, sourceId: savingsGoal.id!, label: savingsGoal.label!, amount: -savingsGoal.monthlyContribution!, occurredOn, accountId: primaryAccountId })
    }

    for (const account of accounts) {
        const occurredOn = account.monthlyFundingDay != null ? getDateInMonth(month, account.monthlyFundingDay) : referenceDate
        if (account.monthlyFunding != null && isFundedAccount(account.id) && existsOn(account.createdAt, occurredOn)) {
            planned.push({ source: PlannedSource.ACCOUNT_FUNDING, sourceId: account.id, label: account.name!, amount: account.monthlyFunding, occurredOn, accountId: primaryAccountId!, toAccountId: account.id })
        }
    }

    return planned.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
}

/**
 * First day of the month before the month of a date, the pending transactions dated before it were not paid
 */
export const getPreviousMonthStart = (today: Date): string => {
    const previousMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))

    return previousMonth.toISOString().slice(0, 10)
}

/**
 * Link of a generated transaction to the rule it comes from, a transfer to fund an account is only linked by its transferId
 */
const LINKS: Record<PlannedSource, { sourceType: TransactionSourceType, link?: 'incomeId' | 'fixedChargeId' | 'installmentId' | 'provisionId' | 'savingsGoalId' }> = {
    [PlannedSource.INCOME]: { sourceType: TransactionSourceType.INCOME, link: 'incomeId' },
    [PlannedSource.FIXED_CHARGE]: { sourceType: TransactionSourceType.FIXED_CHARGE, link: 'fixedChargeId' },
    [PlannedSource.INSTALLMENT]: { sourceType: TransactionSourceType.INSTALLMENT, link: 'installmentId' },
    [PlannedSource.PROVISION_TRANSFER]: { sourceType: TransactionSourceType.TRANSFER, link: 'provisionId' },
    [PlannedSource.PROVISION_PAYMENT]: { sourceType: TransactionSourceType.PROVISION, link: 'provisionId' },
    [PlannedSource.SAVINGS]: { sourceType: TransactionSourceType.SAVINGS, link: 'savingsGoalId' },
    [PlannedSource.ACCOUNT_FUNDING]: { sourceType: TransactionSourceType.TRANSFER },
}

/**
 * Pending transactions to save for planned transactions, a transfer gives two legs sharing a transferId and the link to its rule
 */
export const toPendingTransactions = (planned: PlannedTransaction[], userId: string): DeepPartial<Transaction>[] => planned.flatMap<DeepPartial<Transaction>>(({ source, sourceId, label, amount, occurredOn, accountId, toAccountId, categoryId }) => {
    const { sourceType, link } = LINKS[source]
    const common = { occurredOn, merchant: label, status: TransactionStatus.PENDING, userId, ...(link && { [link]: sourceId }) }

    if (!toAccountId) {
        return [{ ...common, amount, accountId, sourceType, categoryId: categoryId ?? null }]
    }

    const leg = { ...common, sourceType: TransactionSourceType.TRANSFER, transferId: randomUUID() }
    return [
        { ...leg, amount: -amount, accountId },
        { ...leg, amount, accountId: toAccountId },
    ]
})
