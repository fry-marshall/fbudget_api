import { addMonthsToDate } from "./helpers";

describe('helpers', () => {

    describe('addMonthsToDate', () => {
        describe('Success cases', () => {
            it.each([
                ['2026-10-15', 1, '2026-11-15'],
                ['2026-11-15', 2, '2027-01-15'],
                ['2026-03-15', 12, '2027-03-15'],
                ['2026-10-01', 60, '2031-10-01'],
                ['2026-12-01', 1, '2027-01-01'],
            ])('should add months to %s + %p', (date, months, expected) => {
                expect(addMonthsToDate(date, months)).toBe(expected)
            })

            it.each([
                ['2026-12-31', 2, '2027-02-28'],
                ['2027-12-31', 2, '2028-02-29'],
                ['2026-01-31', 3, '2026-04-30'],
                ['2026-08-31', 1, '2026-09-30'],
            ])('should move %s + %p to the last day of a shorter month', (date, months, expected) => {
                expect(addMonthsToDate(date, months)).toBe(expected)
            })
        })
    })
})
