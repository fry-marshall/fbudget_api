import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { And, LessThan, MoreThanOrEqual } from "typeorm";
import { Category } from "../categories/category.entity";
import { CategoryType } from "../categories/types";
import { FixedCharge } from "../fixed-charges/fixed-charge.entity";
import { Income } from "../incomes/income.entity";
import { InstallmentPlan } from "../installment-plans/installment-plan.entity";
import { InstallmentPlanStatus } from "../installment-plans/types";
import { Provision } from "../provisions/provision.entity";
import { ProvisionStatus } from "../provisions/types";
import { SavingsGoal } from "../savings-goals/savings-goal.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { BudgetService } from "./budget.service";

describe('BudgetService', () => {

    const repositoryMocked = () => ({ find: jest.fn() })
    const incomeRepositoryMocked = repositoryMocked()
    const fixedChargeRepositoryMocked = repositoryMocked()
    const installmentPlanRepositoryMocked = repositoryMocked()
    const provisionRepositoryMocked = repositoryMocked()
    const savingsGoalRepositoryMocked = repositoryMocked()
    const transactionRepositoryMocked = repositoryMocked()
    const categoryRepositoryMocked = repositoryMocked()
    let budgetService: BudgetService;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                BudgetService,
                { provide: getRepositoryToken(Income), useValue: incomeRepositoryMocked },
                { provide: getRepositoryToken(FixedCharge), useValue: fixedChargeRepositoryMocked },
                { provide: getRepositoryToken(InstallmentPlan), useValue: installmentPlanRepositoryMocked },
                { provide: getRepositoryToken(Provision), useValue: provisionRepositoryMocked },
                { provide: getRepositoryToken(SavingsGoal), useValue: savingsGoalRepositoryMocked },
                { provide: getRepositoryToken(Transaction), useValue: transactionRepositoryMocked },
                { provide: getRepositoryToken(Category), useValue: categoryRepositoryMocked },
            ]
        }).compile()

        budgetService = moduleRef.get(BudgetService)
    })

    beforeEach(() => {
        jest.resetAllMocks()
        jest.useRealTimers()
        for (const repository of [incomeRepositoryMocked, fixedChargeRepositoryMocked, installmentPlanRepositoryMocked, provisionRepositoryMocked, savingsGoalRepositoryMocked, transactionRepositoryMocked, categoryRepositoryMocked]) {
            repository.find.mockResolvedValue([])
        }
    })

    describe('getSummary', () => {
        describe('Success cases', () => {
            it('should compute the budget of the month from the rules of the user', async () => {
                incomeRepositoryMocked.find.mockResolvedValueOnce([{ amount: 248000 }])
                fixedChargeRepositoryMocked.find.mockResolvedValueOnce([{ amount: 119600 }])
                installmentPlanRepositoryMocked.find.mockResolvedValueOnce([{ status: InstallmentPlanStatus.ACTIVE, installments: [{ dueDate: '2026-11-15', amount: 18750 }, { dueDate: '2026-12-15', amount: 18750 }] }])
                provisionRepositoryMocked.find.mockResolvedValueOnce([{ status: ProvisionStatus.ACTIVE, totalAmount: 70000, frequencyMonths: 12 }])
                savingsGoalRepositoryMocked.find.mockResolvedValueOnce([{ monthlyContribution: 20000 }])

                const response = await budgetService.getSummary('user-id', '2026-11')

                expect(response).toStrictEqual({
                    month: '2026-11',
                    daysInMonth: 30,
                    monthlyIncome: 248000,
                    fixedCharges: 119600,
                    provisionSmoothing: 5834,
                    installmentsDueThisMonth: 18750,
                    savingsContribution: 20000,
                    freeAmount: 83816,
                    perDay: 2793,
                })
                for (const repository of [incomeRepositoryMocked, fixedChargeRepositoryMocked, provisionRepositoryMocked, savingsGoalRepositoryMocked]) {
                    expect(repository.find).toHaveBeenCalledWith({ where: { userId: 'user-id' } })
                }
                expect(installmentPlanRepositoryMocked.find).toHaveBeenCalledWith({ where: { userId: 'user-id' }, relations: { installments: true } })
            })

            it('should compute the current month by default', async () => {
                jest.useFakeTimers({ now: new Date('2027-02-10T08:00:00Z') })

                const response = await budgetService.getSummary('user-id')

                expect(response).toMatchObject({ month: '2027-02', daysInMonth: 28, freeAmount: 0 })
            })
        })

        describe('Failure cases', () => {
            it('should throw Error when a query fails', async () => {
                provisionRepositoryMocked.find.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(budgetService.getSummary('user-id', '2026-11')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('getDashboard', () => {
        describe('Success cases', () => {
            it('should compute where the user stands from the rules, the manual expenses and the categories of the user', async () => {
                jest.useFakeTimers({ now: new Date('2026-11-10T08:00:00Z') })
                incomeRepositoryMocked.find.mockResolvedValueOnce([{ amount: 248000 }])
                fixedChargeRepositoryMocked.find.mockResolvedValueOnce([{ amount: 119600 }])
                provisionRepositoryMocked.find.mockResolvedValueOnce([{ status: ProvisionStatus.ACTIVE, totalAmount: 70000, frequencyMonths: 12 }])
                transactionRepositoryMocked.find.mockResolvedValueOnce([
                    { amount: -8640, occurredOn: '2026-11-03', sourceType: TransactionSourceType.MANUAL, status: TransactionStatus.CONFIRMED, categoryId: 'groceries-id' },
                    { amount: -1360, occurredOn: '2026-11-05', sourceType: TransactionSourceType.MANUAL, status: TransactionStatus.CONFIRMED, categoryId: null },
                ])
                categoryRepositoryMocked.find.mockResolvedValueOnce([{ id: 'groceries-id', type: CategoryType.GROCERIES, label: null, envelopeBudget: 20000 }])

                const response = await budgetService.getDashboard('user-id', '2026-11')

                expect(response).toStrictEqual({
                    month: '2026-11',
                    monthBudget: 122566,
                    provisionSmoothing: 5834,
                    spentThisMonth: 10000,
                    freeAmount: 112566,
                    pacingPct: 8,
                    // 10000 / 10 days × 30 days
                    projectedBalance: 92566,
                    daysElapsed: 10,
                    daysInMonth: 30,
                    categories: [{ categoryId: 'groceries-id', type: CategoryType.GROCERIES, label: null, spent: 8640, envelopeBudget: 20000, pct: 43 }],
                })
                expect(transactionRepositoryMocked.find).toHaveBeenCalledWith({
                    where: {
                        userId: 'user-id',
                        sourceType: TransactionSourceType.MANUAL,
                        status: TransactionStatus.CONFIRMED,
                        occurredOn: And(MoreThanOrEqual('2026-11-01'), LessThan('2026-12-01')),
                    },
                })
                expect(categoryRepositoryMocked.find).toHaveBeenCalledWith({ where: { userId: 'user-id' }, order: { createdAt: 'ASC' } })
            })

            it('should compute the current month by default', async () => {
                jest.useFakeTimers({ now: new Date('2027-02-10T08:00:00Z') })

                const response = await budgetService.getDashboard('user-id')

                expect(response).toMatchObject({ month: '2027-02', daysInMonth: 28, daysElapsed: 10, monthBudget: 0, categories: [] })
            })
        })

        describe('Failure cases', () => {
            it('should throw Error when a query fails', async () => {
                transactionRepositoryMocked.find.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(budgetService.getDashboard('user-id', '2026-11')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })
})
