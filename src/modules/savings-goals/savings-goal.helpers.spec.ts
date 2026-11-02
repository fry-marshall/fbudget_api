import { getProgressPct } from "src/common/helpers/helpers";
import { getProjectedMonth } from "./savings-goal.helpers";

describe('savings goal helpers', () => {

    describe('getProgressPct', () => {
        describe('Success cases', () => {
            it.each([
                [120000, 300000, 40],
                [37500, 150000, 25],
                [0, 300000, 0],
                [299999, 300000, 99],
                [300000, 300000, 100],
                [450000, 300000, 100],
                [-5000, 300000, 0],
            ])('should return the progress of %p saved out of %p as %p', (currentAmount, targetAmount, expected) => {
                expect(getProgressPct(currentAmount, targetAmount)).toBe(expected)
            })

            it('should return null for a goal without target', () => {
                expect(getProgressPct(120000, null)).toBeNull()
            })
        })
    })

    describe('getProjectedMonth', () => {
        const today = new Date('2026-03-10T12:00:00Z')

        describe('Success cases', () => {
            it('should project the month the target is reached from the current month (CALCULATIONS §7)', () => {
                expect(getProjectedMonth(120000, 300000, 20000, today)).toBe('2026-12')
            })

            it('should round the remaining months up', () => {
                expect(getProjectedMonth(120000, 300000, 25000, today)).toBe('2026-11')
            })

            it('should cross the year', () => {
                expect(getProjectedMonth(0, 150000, 10000, today)).toBe('2027-06')
            })

            it('should project the next month when one contribution is missing', () => {
                expect(getProjectedMonth(299000, 300000, 20000, today)).toBe('2026-04')
            })

            it('should project from the end of the month without skipping a short month', () => {
                expect(getProjectedMonth(280000, 300000, 20000, new Date('2026-01-31T12:00:00Z'))).toBe('2026-02')
            })

            it.each([
                ['the target is reached', 300000],
                ['the target is exceeded', 310000],
            ])('should return null when %s', (_, currentAmount) => {
                expect(getProjectedMonth(currentAmount, 300000, 20000, today)).toBeNull()
            })

            it('should return null for a goal without target', () => {
                expect(getProjectedMonth(0, null, 20000, today)).toBeNull()
            })
        })
    })
})
