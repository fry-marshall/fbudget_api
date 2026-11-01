import { addMonthsToDate } from "src/common/helpers/helpers";
import { Installment } from "./installment.entity";

/**
 * Amount of each installment, the remainder of the division goes to the last one
 */
export const getInstallmentAmount = (totalAmount: number, installmentCount: number): number => Math.floor(totalAmount / installmentCount)

/**
 * One installment per month from the first due date, their amounts add up exactly to the total amount
 */
export const buildInstallments = (totalAmount: number, installmentCount: number, firstDueDate: string): Installment[] => {
    const installmentAmount = getInstallmentAmount(totalAmount, installmentCount)
    const remainder = totalAmount - installmentAmount * installmentCount

    return Array.from({ length: installmentCount }, (_, k) => ({
        index: k + 1,
        dueDate: addMonthsToDate(firstDueDate, k),
        amount: k === installmentCount - 1 ? installmentAmount + remainder : installmentAmount,
    }))
}

/**
 * First day of the month following today, an unpaid installment due before it is due, otherwise future
 */
export const getFirstDayOfNextMonth = (today: Date = new Date()): string => addMonthsToDate(`${today.toISOString().slice(0, 7)}-01`, 1)
