import { InstallmentPlanStatus } from "../installment-plans/types";
import { getMonthlyAmount } from "../provisions/provision.helpers";
import { ProvisionStatus } from "../provisions/types";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionSourceType } from "../transactions/types";
import { BudgetDashboard, BudgetRules, BudgetSummary } from "./types";

const sum = (amounts: number[]): number => amounts.reduce((total, amount) => total + amount, 0)

/**
 * Number of days of a YYYY-MM month
 */
export const getDaysInMonth = (month: string): number => {
    const [year, monthIndex] = month.split('-').map(Number)

    // Day 0 of the following month is the last day of the month
    return new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
}

/**
 * Days of the month already started on a day, today included: all of them for a past month, none for a future one
 */
export const getDaysElapsed = (month: string, today: Date): number => {
    const currentMonth = today.toISOString().slice(0, 7)

    if (month < currentMonth) return getDaysInMonth(month)
    if (month > currentMonth) return 0
    return today.getUTCDate()
}

/**
 * What is really free to live in a month once the fixed charges, the smoothed provisions, the installments due and the savings are put aside (CALCULATIONS §3).
 * Computed from the rules of the user, whether their transactions were generated, confirmed or not
 */
export const computeBudgetSummary = (month: string, { incomes, fixedCharges, installmentPlans, provisions, savingsGoals }: BudgetRules): BudgetSummary => {
    const daysInMonth = getDaysInMonth(month)
    const monthlyIncome = sum(incomes.map(({ amount }) => amount!))
    const fixedChargesAmount = sum(fixedCharges.map(({ amount }) => amount!))
    const provisionSmoothing = sum(provisions
        .filter(({ status }) => status === ProvisionStatus.ACTIVE)
        .map(({ totalAmount, frequencyMonths }) => getMonthlyAmount(totalAmount!, frequencyMonths!)))
    const installmentsDueThisMonth = sum(installmentPlans
        .filter(({ status }) => status === InstallmentPlanStatus.ACTIVE)
        .flatMap(({ installments }) => installments ?? [])
        .filter(({ dueDate }) => dueDate!.startsWith(month))
        .map(({ amount }) => amount!))
    const savingsContribution = sum(savingsGoals.map(({ monthlyContribution }) => monthlyContribution!))
    const freeAmount = monthlyIncome - fixedChargesAmount - provisionSmoothing - installmentsDueThisMonth - savingsContribution

    return {
        month,
        daysInMonth,
        monthlyIncome,
        fixedCharges: fixedChargesAmount,
        provisionSmoothing,
        installmentsDueThisMonth,
        savingsContribution,
        freeAmount,
        // Rounded down so that the daily allowance never promises more than the budget
        perDay: Math.floor(freeAmount / daysInMonth),
    }
}

/**
 * Where the user stands in the month on a day (CALCULATIONS §4): the free amount of the month minus the expenses recorded by the user.
 * Only the manual transactions count: the generated ones and the transfers are already in the budget. A refund lowers the expenses
 */
export const computeBudgetDashboard = ({ month, daysInMonth, freeAmount: monthBudget }: BudgetSummary, transactions: Transaction[], today: Date): BudgetDashboard => {
    const manualTotal = sum(transactions
        .filter(({ sourceType, occurredOn }) => sourceType === TransactionSourceType.MANUAL && occurredOn!.startsWith(month))
        .map(({ amount }) => amount!))
    const spentThisMonth = Math.max(0, -manualTotal)
    const daysElapsed = getDaysElapsed(month, today)
    const projectedSpent = daysElapsed > 0 ? Math.round(spentThisMonth * daysInMonth / daysElapsed) : spentThisMonth

    return {
        month,
        monthBudget,
        spentThisMonth,
        freeAmount: monthBudget - spentThisMonth,
        pacingPct: monthBudget > 0 ? Math.floor(spentThisMonth * 100 / monthBudget) : null,
        projectedBalance: monthBudget - projectedSpent,
        daysElapsed,
        daysInMonth,
    }
}
