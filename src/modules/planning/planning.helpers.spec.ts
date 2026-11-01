import { Account } from "../accounts/account.entity";
import { FixedCharge } from "../fixed-charges/fixed-charge.entity";
import { Income } from "../incomes/income.entity";
import { InstallmentPlan } from "../installment-plans/installment-plan.entity";
import { InstallmentPlanStatus } from "../installment-plans/types";
import { Provision } from "../provisions/provision.entity";
import { ProvisionStatus } from "../provisions/types";
import { SavingsGoal } from "../savings-goals/savings-goal.entity";
import { computePlannedTransactions, getDateInMonth, getReferenceDay } from "./planning.helpers";
import { PlannedSource, PlanningRules } from "./types";

describe('planning helpers', () => {
    const createdAt = new Date('2026-01-01T10:00:00Z')

    const primary: Account = { id: 'primary-id', name: 'Compte salaire', isPrimary: true, createdAt }
    const provisionsAccount: Account = { id: 'provisions-id', name: 'Provisions', isPrimary: false, createdAt }
    const livret: Account = { id: 'livret-id', name: 'Livret A', isPrimary: false, createdAt }
    const dailyAccount: Account = { id: 'daily-id', name: 'Dépenses courantes', isPrimary: false, monthlyFunding: 60000, monthlyFundingDay: null, createdAt }

    const salary: Income = { id: 'salary-id', label: 'Salaire', amount: 248000, dayOfMonth: 28, isVariable: false, accountId: null, createdAt }
    const rent: FixedCharge = { id: 'rent-id', label: 'Loyer', amount: 85000, dayOfMonth: 5, accountId: null, categoryId: 'housing-id', createdAt }
    const iphone: InstallmentPlan = {
        id: 'iphone-id', label: 'iPhone 15', installmentCount: 4, status: InstallmentPlanStatus.ACTIVE, accountId: null, categoryId: null, createdAt,
        installments: [
            { id: 'installment-1', index: 1, dueDate: '2026-10-15', amount: 18750 },
            { id: 'installment-2', index: 2, dueDate: '2026-11-15', amount: 18750 },
        ],
    }
    const insurance: Provision = { id: 'insurance-id', label: 'Assurance auto', totalAmount: 70000, frequencyMonths: 12, nextDueDate: '2027-03-15', startedAt: '2026-01-01', status: ProvisionStatus.ACTIVE, accountId: 'provisions-id', categoryId: 'car-id', createdAt }
    const car: SavingsGoal = { id: 'car-id', label: 'Apport voiture', monthlyContribution: 20000, dayOfMonth: null, accountId: 'livret-id', createdAt }

    const rules = (overrides: Partial<PlanningRules> = {}): PlanningRules => ({
        accounts: [primary, provisionsAccount, livret, dailyAccount],
        incomes: [salary],
        fixedCharges: [rent],
        installmentPlans: [iphone],
        provisions: [insurance],
        savingsGoals: [car],
        ...overrides,
    })

    describe('getDateInMonth', () => {
        describe('Success cases', () => {
            it.each([
                ['2026-11', 5, '2026-11-05'],
                ['2026-11', 31, '2026-11-30'],
                ['2027-02', 31, '2027-02-28'],
                ['2028-02', 30, '2028-02-29'],
                ['2026-12', 31, '2026-12-31'],
            ])('should return day %p of %p as %p', (month, day, expected) => {
                expect(getDateInMonth(month, day)).toBe(expected)
            })
        })
    })

    describe('getReferenceDay', () => {
        describe('Success cases', () => {
            it('should return the day of the biggest fixed income credited on the primary account', () => {
                const bonus: Income = { ...salary, id: 'bonus-id', amount: 50000, dayOfMonth: 10 }

                expect(getReferenceDay([bonus, salary], 'primary-id')).toBe(28)
            })

            it('should take the earliest day between two incomes of the same amount', () => {
                expect(getReferenceDay([salary, { ...salary, id: 'other-id', dayOfMonth: 3 }], 'primary-id')).toBe(3)
            })

            it.each([
                ['a variable income', { isVariable: true }],
                ['an income without day', { dayOfMonth: null }],
                ['an income credited on another account', { accountId: 'livret-id' }],
            ])('should ignore %s', (_, overrides) => {
                expect(getReferenceDay([{ ...salary, amount: 999999, dayOfMonth: 10, ...overrides }, salary], 'primary-id')).toBe(28)
            })

            it('should return the 1st without fixed income on the primary account', () => {
                expect(getReferenceDay([], 'primary-id')).toBe(1)
            })

            it('should return the 1st without primary account', () => {
                expect(getReferenceDay([salary], null)).toBe(1)
            })
        })
    })

    describe('computePlannedTransactions', () => {
        describe('Success cases', () => {
            it('should plan the whole month, sorted by date', () => {
                expect(computePlannedTransactions('2026-11', rules())).toEqual([
                    { source: PlannedSource.FIXED_CHARGE, sourceId: 'rent-id', label: 'Loyer', amount: -85000, occurredOn: '2026-11-05', accountId: 'primary-id', categoryId: 'housing-id' },
                    { source: PlannedSource.INSTALLMENT, sourceId: 'installment-2', label: 'iPhone 15 2/4', amount: -18750, occurredOn: '2026-11-15', accountId: 'primary-id', categoryId: null },
                    { source: PlannedSource.INCOME, sourceId: 'salary-id', label: 'Salaire', amount: 248000, occurredOn: '2026-11-28', accountId: 'primary-id' },
                    { source: PlannedSource.PROVISION_TRANSFER, sourceId: 'insurance-id', label: 'Assurance auto', amount: 5834, occurredOn: '2026-11-28', accountId: 'primary-id', toAccountId: 'provisions-id' },
                    { source: PlannedSource.SAVINGS, sourceId: 'car-id', label: 'Apport voiture', amount: 20000, occurredOn: '2026-11-28', accountId: 'primary-id', toAccountId: 'livret-id' },
                    { source: PlannedSource.ACCOUNT_FUNDING, sourceId: 'daily-id', label: 'Dépenses courantes', amount: 60000, occurredOn: '2026-11-28', accountId: 'primary-id', toAccountId: 'daily-id' },
                ])
            })

            it('should move the days missing in the month to its last day', () => {
                const planned = computePlannedTransactions('2027-02', rules({ incomes: [{ ...salary, dayOfMonth: 31 }], fixedCharges: [{ ...rent, dayOfMonth: 30 }] }))

                expect(planned.find((transaction) => transaction.source === PlannedSource.INCOME)!.occurredOn).toBe('2027-02-28')
                expect(planned.find((transaction) => transaction.source === PlannedSource.FIXED_CHARGE)!.occurredOn).toBe('2027-02-28')
                expect(planned.find((transaction) => transaction.source === PlannedSource.PROVISION_TRANSFER)!.occurredOn).toBe('2027-02-28')
            })

            it('should debit and credit the accounts of the rules instead of the primary account', () => {
                const planned = computePlannedTransactions('2026-11', rules({
                    incomes: [{ ...salary, accountId: 'livret-id', isVariable: true }],
                    fixedCharges: [{ ...rent, accountId: 'daily-id' }],
                    installmentPlans: [{ ...iphone, accountId: 'daily-id' }],
                }))

                expect(planned.filter((transaction) => [PlannedSource.INCOME, PlannedSource.FIXED_CHARGE, PlannedSource.INSTALLMENT].includes(transaction.source)).map((transaction) => transaction.accountId))
                    .toEqual(['daily-id', 'daily-id', 'livret-id'])
            })

            it('should plan a variable income with its estimated amount, on the 1st without day', () => {
                const planned = computePlannedTransactions('2026-11', rules({ incomes: [salary, { ...salary, id: 'freelance-id', label: 'Freelance', amount: 30000, isVariable: true, dayOfMonth: null }] }))

                expect(planned.find((transaction) => transaction.sourceId === 'freelance-id')).toMatchObject({ amount: 30000, occurredOn: '2026-11-01' })
            })

            it('should plan the transfers on the 1st without fixed income on the primary account', () => {
                const planned = computePlannedTransactions('2026-11', rules({ incomes: [] }))

                expect(planned.filter((transaction) => transaction.toAccountId).map((transaction) => transaction.occurredOn)).toEqual(['2026-11-01', '2026-11-01', '2026-11-01'])
            })

            it('should plan a savings contribution and an account funding on their own day', () => {
                const planned = computePlannedTransactions('2026-11', rules({ savingsGoals: [{ ...car, dayOfMonth: 2 }], accounts: [primary, provisionsAccount, livret, { ...dailyAccount, monthlyFundingDay: 30 }] }))

                expect(planned.find((transaction) => transaction.source === PlannedSource.SAVINGS)!.occurredOn).toBe('2026-11-02')
                expect(planned.find((transaction) => transaction.source === PlannedSource.ACCOUNT_FUNDING)!.occurredOn).toBe('2026-11-30')
            })

            it('should debit the primary account for a savings goal without savings account', () => {
                const planned = computePlannedTransactions('2026-11', rules({ savingsGoals: [{ ...car, accountId: null }] }))

                const savings = planned.find((transaction) => transaction.source === PlannedSource.SAVINGS)
                expect(savings).toMatchObject({ amount: -20000, accountId: 'primary-id' })
                expect(savings!.toAccountId).toBeUndefined()
            })

            it('should plan both the last transfer and the payment of a provision due in the month', () => {
                const planned = computePlannedTransactions('2027-03', rules())

                expect(planned.filter((transaction) => transaction.sourceId === 'insurance-id')).toEqual([
                    { source: PlannedSource.PROVISION_PAYMENT, sourceId: 'insurance-id', label: 'Assurance auto', amount: -70000, occurredOn: '2027-03-15', accountId: 'provisions-id', categoryId: 'car-id' },
                    { source: PlannedSource.PROVISION_TRANSFER, sourceId: 'insurance-id', label: 'Assurance auto', amount: 5834, occurredOn: '2027-03-28', accountId: 'primary-id', toAccountId: 'provisions-id' },
                ])
            })

            it.each([
                ['without dedicated account', { accountId: null }, 'primary-id'],
                ['on the primary account', { accountId: 'primary-id' }, 'primary-id'],
            ])('should only plan the payment of a provision %s', (_, overrides, paymentAccountId) => {
                const planned = computePlannedTransactions('2027-03', rules({ provisions: [{ ...insurance, ...overrides }] }))

                expect(planned.filter((transaction) => transaction.sourceId === 'insurance-id')).toEqual([expect.objectContaining({ source: PlannedSource.PROVISION_PAYMENT, accountId: paymentAccountId })])
            })

            it('should not plan the transfer of a provision before it started', () => {
                const planned = computePlannedTransactions('2026-11', rules({ provisions: [{ ...insurance, startedAt: '2026-12-01' }] }))

                expect(planned.some((transaction) => transaction.source === PlannedSource.PROVISION_TRANSFER)).toBe(false)
            })

            it.each([ProvisionStatus.PAUSED, ProvisionStatus.CANCELLED])('should plan nothing for a %s provision', (status) => {
                const planned = computePlannedTransactions('2027-03', rules({ provisions: [{ ...insurance, status }] }))

                expect(planned.some((transaction) => transaction.sourceId === 'insurance-id')).toBe(false)
            })

            it('should plan nothing for a cancelled installment plan', () => {
                const planned = computePlannedTransactions('2026-11', rules({ installmentPlans: [{ ...iphone, status: InstallmentPlanStatus.CANCELLED }] }))

                expect(planned.some((transaction) => transaction.source === PlannedSource.INSTALLMENT)).toBe(false)
            })

            it('should only plan the installments due in the month', () => {
                expect(computePlannedTransactions('2026-12', rules()).some((transaction) => transaction.source === PlannedSource.INSTALLMENT)).toBe(false)
            })

            it('should not plan the rules created after their day of the month, but plan the dated ones', () => {
                const createdOn20 = new Date('2026-11-20T08:00:00Z')
                const planned = computePlannedTransactions('2026-11', rules({
                    accounts: [primary, provisionsAccount, livret, { ...dailyAccount, monthlyFundingDay: 10, createdAt: createdOn20 }],
                    fixedCharges: [{ ...rent, createdAt: createdOn20 }],
                    installmentPlans: [{ ...iphone, createdAt: createdOn20 }],
                    savingsGoals: [{ ...car, createdAt: createdOn20 }],
                }))

                expect(planned.map((transaction) => transaction.source)).toEqual([PlannedSource.INSTALLMENT, PlannedSource.INCOME, PlannedSource.PROVISION_TRANSFER, PlannedSource.SAVINGS])
            })

            it('should plan a rule created on its day of the month', () => {
                const planned = computePlannedTransactions('2026-11', rules({ fixedCharges: [{ ...rent, createdAt: new Date('2026-11-05T23:00:00Z') }] }))

                expect(planned.some((transaction) => transaction.source === PlannedSource.FIXED_CHARGE)).toBe(true)
            })

            it('should not plan anything for the months before a rule existed', () => {
                const planned = computePlannedTransactions('2025-11', rules({ installmentPlans: [], provisions: [] }))

                expect(planned).toEqual([])
            })

            it('should not fund the primary account even with a monthly funding', () => {
                const planned = computePlannedTransactions('2026-11', rules({ accounts: [{ ...primary, monthlyFunding: 60000 }, provisionsAccount, livret] }))

                expect(planned.some((transaction) => transaction.source === PlannedSource.ACCOUNT_FUNDING)).toBe(false)
            })

            it('should only plan the rules with their own account when the user has no primary account', () => {
                const planned = computePlannedTransactions('2027-03', rules({
                    accounts: [provisionsAccount, livret, dailyAccount],
                    fixedCharges: [rent, { ...rent, id: 'internet-id', accountId: 'daily-id' }],
                }))

                expect(planned.map((transaction) => [transaction.source, transaction.sourceId])).toEqual([
                    [PlannedSource.FIXED_CHARGE, 'internet-id'],
                    [PlannedSource.PROVISION_PAYMENT, 'insurance-id'],
                ])
            })

            it('should return an empty list for a user without rules', () => {
                expect(computePlannedTransactions('2026-11', { accounts: [], incomes: [], fixedCharges: [], installmentPlans: [], provisions: [], savingsGoals: [] })).toEqual([])
            })
        })
    })
})
