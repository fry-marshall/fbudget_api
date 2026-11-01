import { addMonthsToDate } from "src/common/helpers/helpers";

/**
 * Share of the target already saved, as an integer between 0 and 100, null for a goal without target
 */
export const getProgressPct = (currentAmount: number, targetAmount: number | null): number | null => {
    if (targetAmount === null) {
        return null
    }

    return Math.max(0, Math.min(100, Math.floor(currentAmount * 100 / targetAmount)))
}

/**
 * Month (YYYY-MM) the target is reached by contributing monthlyContribution from the current month,
 * null for a goal without target or already reached (CALCULATIONS §7)
 */
export const getProjectedMonth = (currentAmount: number, targetAmount: number | null, monthlyContribution: number, today: Date = new Date()): string | null => {
    if (targetAmount === null || currentAmount >= targetAmount) {
        return null
    }

    const remainingMonths = Math.ceil((targetAmount - currentAmount) / monthlyContribution)

    return addMonthsToDate(`${today.toISOString().slice(0, 7)}-01`, remainingMonths).slice(0, 7)
}
