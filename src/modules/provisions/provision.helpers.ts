/**
 * Amount to put aside each month for a provision, rounded up so that the total is reached at the due date
 */
export const getMonthlyAmount = (totalAmount: number, frequencyMonths: number): number => Math.ceil(totalAmount / frequencyMonths)
