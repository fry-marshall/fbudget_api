import { FixedCharge } from "../fixed-charges/fixed-charge.entity";
import { Income } from "../incomes/income.entity";
import { InstallmentPlan } from "../installment-plans/installment-plan.entity";
import { InstallmentPlanStatus } from "../installment-plans/types";
import { Provision } from "../provisions/provision.entity";
import { ProvisionStatus } from "../provisions/types";
import { SavingsGoal } from "../savings-goals/savings-goal.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { computeBudgetDashboard, computeBudgetSummary, getDaysElapsed, getDaysInMonth } from "./budget.calculator";
import { Category } from "../categories/category.entity";
import { CategoryType } from "../categories/types";
import { BudgetRules, BudgetSummary } from "./types";

describe('budget calculator', () => {
    // The onboarding recap of the mockups (CALCULATIONS §3)
    const salary: Income = { id: 'salary-id', label: 'Salaire', amount: 248000, dayOfMonth: 28, isVariable: false }
    const rent: FixedCharge = { id: 'rent-id', label: 'Loyer et charges', amount: 119600, dayOfMonth: 5 }
    const provision = (label: string, totalAmount: number, frequencyMonths: number, status = ProvisionStatus.ACTIVE): Provision => ({ id: `${label}-id`, label, totalAmount, frequencyMonths, nextDueDate: '2027-03-15', status })
    const provisions = [provision('Théâtre', 12000, 3), provision('Coiffeur', 6000, 2), provision('Assurance auto', 70000, 12), provision('Dentiste', 15000, 6)]
    const plan = (label: string, amount: number, dueDates: string[], status = InstallmentPlanStatus.ACTIVE): InstallmentPlan => ({
        id: `${label}-id`, label, status,
        installments: dueDates.map((dueDate, index) => ({ id: `${label}-${index + 1}`, index: index + 1, dueDate, amount })),
    })
    const iphone = plan('iPhone 15', 18750, ['2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15'])
    const sofa = plan('Canapé', 8900, ['2026-09-10', '2026-10-10', '2026-11-10'])
    const car: SavingsGoal = { id: 'car-id', label: 'Apport voiture', monthlyContribution: 20000 }

    const rules = (overrides: Partial<BudgetRules> = {}): BudgetRules => ({
        incomes: [salary],
        fixedCharges: [rent],
        installmentPlans: [iphone, sofa],
        provisions,
        savingsGoals: [car],
        ...overrides,
    })

    describe('getDaysInMonth', () => {
        describe('Success cases', () => {
            it.each([
                ['2026-11', 30],
                ['2026-12', 31],
                ['2027-02', 28],
                ['2028-02', 29],
            ])('should return %p days for %p', (month, expected) => {
                expect(getDaysInMonth(month)).toBe(expected)
            })
        })
    })

    describe('getDaysElapsed', () => {
        describe('Success cases', () => {
            it.each([
                ['the first day of the month', '2026-11-01T00:05:00Z', 1],
                ['a day of the month, today included', '2026-11-22T18:00:00Z', 22],
                ['the last day of the month', '2026-11-30T23:59:59Z', 30],
                ['a later month', '2026-12-03T10:00:00Z', 30],
                ['an earlier month', '2026-10-31T10:00:00Z', 0],
            ])('should count the days of 2026-11 on %s', (_, today, expected) => {
                expect(getDaysElapsed('2026-11', new Date(today))).toBe(expected)
            })
        })
    })

    describe('computeBudgetSummary', () => {
        describe('Success cases', () => {
            it('should compute what is really free to live in the month', () => {
                // The mockup shows 654,50 € with a 153 € smoothing rounded for display, the monthly amount of each provision is rounded up (5834 for 700 € / 12)
                expect(computeBudgetSummary('2026-11', rules())).toStrictEqual({
                    month: '2026-11',
                    daysInMonth: 30,
                    monthlyIncome: 248000,
                    fixedCharges: 119600,
                    provisionSmoothing: 15334,
                    installmentsDueThisMonth: 27650,
                    savingsContribution: 20000,
                    freeAmount: 65416,
                    perDay: 2180,
                })
            })

            it('should sum every income, the variable ones with their estimated amount', () => {
                const bonus: Income = { id: 'bonus-id', label: 'Prime', amount: 30000, dayOfMonth: null, isVariable: true }

                expect(computeBudgetSummary('2026-11', rules({ incomes: [salary, bonus] }))).toMatchObject({ monthlyIncome: 278000, freeAmount: 95416 })
            })

            it('should only smooth the active provisions', () => {
                const summary = computeBudgetSummary('2026-11', rules({ provisions: [provision('Assurance auto', 70000, 12), provision('Coiffeur', 6000, 2, ProvisionStatus.PAUSED), provision('Dentiste', 15000, 6, ProvisionStatus.CANCELLED)] }))

                expect(summary.provisionSmoothing).toBe(5834)
            })

            it('should only count the installments due in the month of the active plans', () => {
                const cancelled = plan('Télé', 5000, ['2026-11-20'], InstallmentPlanStatus.CANCELLED)

                expect(computeBudgetSummary('2026-11', rules({ installmentPlans: [iphone, sofa, cancelled] })).installmentsDueThisMonth).toBe(27650)
                expect(computeBudgetSummary('2026-12', rules({ installmentPlans: [iphone, sofa, cancelled] })).installmentsDueThisMonth).toBe(18750)
                expect(computeBudgetSummary('2027-02', rules({ installmentPlans: [iphone, sofa, cancelled] })).installmentsDueThisMonth).toBe(0)
            })

            it.each([
                ['2027-02', 28, 3323],
                ['2026-12', 31, 3002],
            ])('should share the free amount of %p over its %p days', (month, daysInMonth, perDay) => {
                expect(computeBudgetSummary(month, rules({ installmentPlans: [] }))).toMatchObject({ daysInMonth, freeAmount: 65416 + 27650, perDay })
            })

            it('should return a negative budget when the commitments exceed the incomes, without promising more per day', () => {
                const summary = computeBudgetSummary('2026-11', rules({ incomes: [{ ...salary, amount: 150000 }] }))

                expect(summary).toMatchObject({ freeAmount: -32584, perDay: -1087 })
            })

            it('should return a negative budget for a month without income', () => {
                expect(computeBudgetSummary('2026-11', rules({ incomes: [] }))).toMatchObject({ monthlyIncome: 0, freeAmount: -182584 })
            })

            it('should return an empty budget for a user without rules', () => {
                expect(computeBudgetSummary('2026-11', { incomes: [], fixedCharges: [], installmentPlans: [], provisions: [], savingsGoals: [] })).toMatchObject({ monthlyIncome: 0, freeAmount: 0, perDay: 0 })
            })
        })
    })

    describe('computeBudgetDashboard', () => {
        // The dashboard of the mockups (CALCULATIONS §4): 420 € to live in March, 148,30 € spent on the 22nd
        const summary: BudgetSummary = { month: '2027-03', daysInMonth: 31, monthlyIncome: 248000, fixedCharges: 119600, provisionSmoothing: 15300, installmentsDueThisMonth: 27650, savingsContribution: 43450, freeAmount: 42000, perDay: 1354 }
        const day22 = new Date('2027-03-22T12:00:00Z')
        const transaction = (amount: number, overrides: Partial<Transaction> = {}): Transaction => ({ amount, occurredOn: '2027-03-10', sourceType: TransactionSourceType.MANUAL, status: TransactionStatus.CONFIRMED, ...overrides })
        const groceries = [transaction(-8640), transaction(-4290), transaction(-1250), transaction(-650)]
        const category = (id: string, type: CategoryType, envelopeBudget: number | null, label: string | null = null): Category => ({ id, type, label, envelopeBudget })

        describe('Success cases', () => {
            it('should compute what is left, the pacing and the projection at the end of the month', () => {
                expect(computeBudgetDashboard(summary, groceries, [], day22)).toStrictEqual({
                    month: '2027-03',
                    monthBudget: 42000,
                    provisionSmoothing: 15300,
                    spentThisMonth: 14830,
                    freeAmount: 27170,
                    pacingPct: 35,
                    // 14830 / 22 days × 31 days = 20897 spent at this pace
                    projectedBalance: 21103,
                    daysElapsed: 22,
                    daysInMonth: 31,
                    categories: [],
                })
            })

            it('should not count the generated transactions and the transfers, already in the budget', () => {
                const generated = [
                    transaction(-119600, { sourceType: TransactionSourceType.FIXED_CHARGE }),
                    transaction(248000, { sourceType: TransactionSourceType.INCOME }),
                    transaction(-18750, { sourceType: TransactionSourceType.INSTALLMENT, status: TransactionStatus.PENDING }),
                    transaction(-5834, { sourceType: TransactionSourceType.TRANSFER }),
                    transaction(5834, { sourceType: TransactionSourceType.TRANSFER }),
                    transaction(-70000, { sourceType: TransactionSourceType.PROVISION }),
                    transaction(-20000, { sourceType: TransactionSourceType.SAVINGS }),
                ]

                expect(computeBudgetDashboard(summary, [...groceries, ...generated], [], day22).spentThisMonth).toBe(14830)
            })

            it('should lower the expenses with a refund, never below 0', () => {
                expect(computeBudgetDashboard(summary, [...groceries, transaction(4290)], [], day22).spentThisMonth).toBe(10540)
                expect(computeBudgetDashboard(summary, [transaction(-1000), transaction(5000)], [], day22)).toMatchObject({ spentThisMonth: 0, freeAmount: 42000, pacingPct: 0, projectedBalance: 42000 })
            })

            it('should ignore the transactions of the other months', () => {
                expect(computeBudgetDashboard(summary, [...groceries, transaction(-5000, { occurredOn: '2027-02-28' }), transaction(-5000, { occurredOn: '2027-04-01' })], [], day22).spentThisMonth).toBe(14830)
            })

            it('should project the pace of the first day over the whole month', () => {
                expect(computeBudgetDashboard(summary, [transaction(-1000, { occurredOn: '2027-03-01' })], [], new Date('2027-03-01T08:00:00Z'))).toMatchObject({ daysElapsed: 1, projectedBalance: 42000 - 31000 })
            })

            it('should project the actual expenses on the last day and on a past month', () => {
                expect(computeBudgetDashboard(summary, groceries, [], new Date('2027-03-31T20:00:00Z'))).toMatchObject({ daysElapsed: 31, projectedBalance: 27170 })
                expect(computeBudgetDashboard(summary, groceries, [], new Date('2027-05-02T08:00:00Z'))).toMatchObject({ daysElapsed: 31, projectedBalance: 27170 })
            })

            it('should keep the whole budget for a month not started yet', () => {
                expect(computeBudgetDashboard(summary, [], [], new Date('2027-02-20T08:00:00Z'))).toMatchObject({ daysElapsed: 0, spentThisMonth: 0, freeAmount: 42000, projectedBalance: 42000 })
            })

            it('should exceed 100 % and project a negative balance when overspending', () => {
                expect(computeBudgetDashboard(summary, [transaction(-50000)], [], day22)).toMatchObject({ freeAmount: -8000, pacingPct: 119, projectedBalance: 42000 - 70455 })
            })

            it('should not count the pending manual transactions', () => {
                expect(computeBudgetDashboard(summary, [...groceries, transaction(-5000, { status: TransactionStatus.PENDING })], [], day22).spentThisMonth).toBe(14830)
            })

            it('should compute the expenses of each category against its envelope', () => {
                const categories = [
                    category('groceries-id', CategoryType.GROCERIES, 20000),
                    category('restaurants-id', CategoryType.RESTAURANTS, 6000),
                    category('pets-id', CategoryType.OTHER, null, 'Animaux'),
                    category('transport-id', CategoryType.TRANSPORT, 0),
                ]
                const transactions = [
                    ...groceries.map((groceriesTransaction) => ({ ...groceriesTransaction, categoryId: 'groceries-id' })),
                    transaction(-4500, { categoryId: 'restaurants-id' }),
                    transaction(-3000, { categoryId: 'restaurants-id' }),
                    transaction(-1999, { categoryId: 'pets-id' }),
                    // Without category, in spentThisMonth only
                    transaction(-2000, { categoryId: null }),
                    // Not counted in the categories either
                    transaction(-9000, { categoryId: 'groceries-id', sourceType: TransactionSourceType.FIXED_CHARGE }),
                    transaction(-9000, { categoryId: 'groceries-id', occurredOn: '2027-02-28' }),
                ]

                const dashboard = computeBudgetDashboard(summary, transactions, categories, day22)

                expect(dashboard.spentThisMonth).toBe(14830 + 7500 + 1999 + 2000)
                expect(dashboard.categories).toStrictEqual([
                    { categoryId: 'groceries-id', type: CategoryType.GROCERIES, label: null, spent: 14830, envelopeBudget: 20000, pct: 74 },
                    { categoryId: 'restaurants-id', type: CategoryType.RESTAURANTS, label: null, spent: 7500, envelopeBudget: 6000, pct: 125 },
                    { categoryId: 'pets-id', type: CategoryType.OTHER, label: 'Animaux', spent: 1999, envelopeBudget: null, pct: null },
                    { categoryId: 'transport-id', type: CategoryType.TRANSPORT, label: null, spent: 0, envelopeBudget: 0, pct: null },
                ])
            })

            it('should lower the expenses of a category with a refund, never below 0', () => {
                const categories = [category('groceries-id', CategoryType.GROCERIES, 20000), category('leisure-id', CategoryType.LEISURE, 5000)]
                const transactions = [
                    transaction(-8640, { categoryId: 'groceries-id' }),
                    transaction(4290, { categoryId: 'groceries-id' }),
                    transaction(-1000, { categoryId: 'leisure-id' }),
                    transaction(3000, { categoryId: 'leisure-id' }),
                ]

                expect(computeBudgetDashboard(summary, transactions, categories, day22).categories).toMatchObject([
                    { categoryId: 'groceries-id', spent: 4350, pct: 21 },
                    { categoryId: 'leisure-id', spent: 0, pct: 0 },
                ])
            })

            it.each([0, -32584])('should not compute the pacing with a budget of %p', (freeAmount) => {
                expect(computeBudgetDashboard({ ...summary, freeAmount }, groceries, [], day22)).toMatchObject({ monthBudget: freeAmount, pacingPct: null, freeAmount: freeAmount - 14830 })
            })
        })
    })
})
