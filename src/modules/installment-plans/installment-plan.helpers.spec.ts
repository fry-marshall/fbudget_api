import { buildInstallments, getFirstDayOfNextMonth, getInstallmentAmount } from "./installment-plan.helpers";

describe('installment plan helpers', () => {

    describe('getInstallmentAmount', () => {
        describe('Success cases', () => {
            it.each([
                [75000, 4, 18750],
                [89000, 10, 8900],
                [10000, 3, 3333],
                [2, 2, 1],
            ])('should divide %p in %p installments of %p', (totalAmount, installmentCount, expected) => {
                expect(getInstallmentAmount(totalAmount, installmentCount)).toBe(expected)
            })
        })
    })

    describe('buildInstallments', () => {
        describe('Success cases', () => {
            it('should build one installment per month from the first due date', () => {
                expect(buildInstallments(75000, 4, '2026-11-15')).toEqual([
                    { index: 1, dueDate: '2026-11-15', amount: 18750 },
                    { index: 2, dueDate: '2026-12-15', amount: 18750 },
                    { index: 3, dueDate: '2027-01-15', amount: 18750 },
                    { index: 4, dueDate: '2027-02-15', amount: 18750 },
                ])
            })

            it('should add the remainder to the last installment so that the sum is exact', () => {
                const installments = buildInstallments(10000, 3, '2026-11-15')

                expect(installments.map((installment) => installment.amount)).toEqual([3333, 3333, 3334])
                expect(installments.reduce((sum, installment) => sum + installment.amount!, 0)).toBe(10000)
            })

            it('should move a due date on a 31st to the last day of the shorter months without drifting', () => {
                expect(buildInstallments(4000, 4, '2026-12-31').map((installment) => installment.dueDate)).toEqual(['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'])
            })

            it('should build 60 installments', () => {
                const installments = buildInstallments(600000, 60, '2026-11-15')

                expect(installments).toHaveLength(60)
                expect(installments[59]).toEqual({ index: 60, dueDate: '2031-10-15', amount: 10000 })
            })
        })
    })

    describe('getFirstDayOfNextMonth', () => {
        describe('Success cases', () => {
            it.each([
                ['2026-11-01T00:00:00Z', '2026-12-01'],
                ['2026-11-30T23:59:59Z', '2026-12-01'],
                ['2026-12-15T12:00:00Z', '2027-01-01'],
            ])('should return the first day of the month after %s', (today, expected) => {
                expect(getFirstDayOfNextMonth(new Date(today))).toBe(expected)
            })
        })
    })
})
