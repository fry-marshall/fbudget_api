import { Test } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { DataSource, In, LessThan } from "typeorm";
import { Account } from "../accounts/account.entity";
import { FixedCharge } from "../fixed-charges/fixed-charge.entity";
import { Income } from "../incomes/income.entity";
import { InstallmentPlan } from "../installment-plans/installment-plan.entity";
import { InstallmentPlanStatus } from "../installment-plans/types";
import { ProvisionStatus } from "../provisions/types";
import { Provision } from "../provisions/provision.entity";
import { SavingsGoal } from "../savings-goals/savings-goal.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { User } from "../users/user.entity";
import { PlanningService } from "./planning.service";

describe('PlanningService', () => {

    let managerMocked = {
        findOne: jest.fn(),
        find: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
    };
    let accountRepositoryMocked = {
        find: jest.fn(),
    };
    let transactionRepositoryMocked = {
        delete: jest.fn(),
    };
    let dataSourceMocked = {
        transaction: jest.fn(),
        getRepository: jest.fn(),
    };
    let planningService: PlanningService;

    const today = new Date('2026-11-02T00:05:00Z')
    const createdAt = new Date('2026-01-01T10:00:00Z')
    const primary: Account = { id: 'primary-id', name: 'Compte salaire', isPrimary: true, lastGeneratedMonth: null, createdAt }
    const salary: Income = { id: 'salary-id', label: 'Salaire', amount: 248000, dayOfMonth: 28, isVariable: false, accountId: null, lastGeneratedMonth: null, createdAt }
    const rent: FixedCharge = { id: 'rent-id', label: 'Loyer', amount: 85000, dayOfMonth: 5, accountId: null, categoryId: null, lastGeneratedMonth: null, createdAt }
    const iphone: InstallmentPlan = {
        id: 'iphone-id', label: 'iPhone 15', installmentCount: 4, status: InstallmentPlanStatus.ACTIVE, accountId: null, categoryId: null, lastGeneratedMonth: null, createdAt,
        installments: [{ id: 'installment-2', index: 2, dueDate: '2026-11-15', amount: 18750 }],
    }

    const mockRules = (rules: { accounts?: Account[], incomes?: Income[], fixedCharges?: FixedCharge[], installmentPlans?: InstallmentPlan[], provisions?: Provision[], paidInstallments?: Transaction[] } = {}) => {
        const data = new Map<unknown, unknown[]>([
            [Account, rules.accounts ?? [primary]],
            [Income, rules.incomes ?? [salary]],
            [FixedCharge, rules.fixedCharges ?? [rent]],
            [InstallmentPlan, rules.installmentPlans ?? []],
            [Provision, rules.provisions ?? []],
            [SavingsGoal, []],
            [Transaction, rules.paidInstallments ?? []],
        ])
        managerMocked.find.mockImplementation((entity) => Promise.resolve(data.get(entity)))
    }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                PlanningService,
                { provide: DataSource, useValue: dataSourceMocked },
            ]
        }).compile()

        planningService = moduleRef.get(PlanningService)
    })

    beforeEach(() => {
        jest.resetAllMocks()
        jest.spyOn(Logger.prototype, 'log').mockImplementation()
        jest.spyOn(Logger.prototype, 'error').mockImplementation()
        dataSourceMocked.transaction.mockImplementation((callback) => callback(managerMocked))
        dataSourceMocked.getRepository.mockImplementation((entity) => entity === Account ? accountRepositoryMocked : transactionRepositoryMocked)
        managerMocked.findOne.mockResolvedValue({ id: 'user-id' })
        managerMocked.save.mockImplementation((_entity, transactions) => Promise.resolve(transactions))
    })

    describe('generateForUser', () => {
        describe('Success cases', () => {
            it('should save the planned transactions of the month as pending and move the cursors of their rules', async () => {
                mockRules()

                const response = await planningService.generateForUser('user-id', today)

                expect(response).toEqual(2)
                expect(managerMocked.findOne).toHaveBeenCalledWith(User, { where: { id: 'user-id' }, lock: { mode: 'pessimistic_write' } })
                expect(managerMocked.save).toHaveBeenCalledWith(Transaction, [
                    expect.objectContaining({ amount: -85000, occurredOn: '2026-11-05', accountId: 'primary-id', sourceType: TransactionSourceType.FIXED_CHARGE, fixedChargeId: 'rent-id', status: TransactionStatus.PENDING, userId: 'user-id' }),
                    expect.objectContaining({ amount: 248000, occurredOn: '2026-11-28', accountId: 'primary-id', sourceType: TransactionSourceType.INCOME, incomeId: 'salary-id', status: TransactionStatus.PENDING, userId: 'user-id' }),
                ])
                expect(managerMocked.update).toHaveBeenCalledTimes(2)
                expect(managerMocked.update).toHaveBeenCalledWith(FixedCharge, { id: In(['rent-id']) }, { lastGeneratedMonth: '2026-11' })
                expect(managerMocked.update).toHaveBeenCalledWith(Income, { id: In(['salary-id']) }, { lastGeneratedMonth: '2026-11' })
            })

            it('should skip the rules already generated this month', async () => {
                mockRules({ incomes: [{ ...salary, lastGeneratedMonth: '2026-11' }] })

                const response = await planningService.generateForUser('user-id', today)

                expect(response).toEqual(1)
                expect(managerMocked.save).toHaveBeenCalledWith(Transaction, [expect.objectContaining({ fixedChargeId: 'rent-id' })])
                expect(managerMocked.update).toHaveBeenCalledTimes(1)
                expect(managerMocked.update).toHaveBeenCalledWith(FixedCharge, { id: In(['rent-id']) }, { lastGeneratedMonth: '2026-11' })
            })

            it('should keep the reference day of an income already generated for the other rules', async () => {
                const livret: Account = { id: 'livret-id', name: 'Livret A', isPrimary: false, monthlyFunding: 20000, monthlyFundingDay: null, lastGeneratedMonth: null, createdAt }
                mockRules({ accounts: [primary, livret], incomes: [{ ...salary, lastGeneratedMonth: '2026-11' }], fixedCharges: [] })

                await planningService.generateForUser('user-id', today)

                expect(managerMocked.save).toHaveBeenCalledWith(Transaction, [
                    expect.objectContaining({ amount: -20000, occurredOn: '2026-11-28', accountId: 'primary-id', sourceType: TransactionSourceType.TRANSFER }),
                    expect.objectContaining({ amount: 20000, occurredOn: '2026-11-28', accountId: 'livret-id', sourceType: TransactionSourceType.TRANSFER }),
                ])
                expect(managerMocked.update).toHaveBeenCalledWith(Account, { id: In(['livret-id']) }, { lastGeneratedMonth: '2026-11' })
            })

            it('should move the cursor of the plan of a generated installment', async () => {
                mockRules({ incomes: [], fixedCharges: [], installmentPlans: [iphone] })

                await planningService.generateForUser('user-id', today)

                expect(managerMocked.save).toHaveBeenCalledWith(Transaction, [expect.objectContaining({ amount: -18750, sourceType: TransactionSourceType.INSTALLMENT, installmentId: 'installment-2' })])
                expect(managerMocked.update).toHaveBeenCalledWith(InstallmentPlan, { id: In(['iphone-id']) }, { lastGeneratedMonth: '2026-11' })
            })

            it('should move the next due date of a provision forward when its payment is generated', async () => {
                const insurance: Provision = { id: 'insurance-id', label: 'Assurance auto', totalAmount: 70000, frequencyMonths: 12, nextDueDate: '2026-11-15', startedAt: '2026-01-01', status: ProvisionStatus.ACTIVE, accountId: null, categoryId: null, lastGeneratedMonth: null, createdAt }
                mockRules({ incomes: [], fixedCharges: [], provisions: [insurance] })

                await planningService.generateForUser('user-id', today)

                expect(managerMocked.save).toHaveBeenCalledWith(Transaction, [expect.objectContaining({ amount: -70000, occurredOn: '2026-11-15', sourceType: TransactionSourceType.PROVISION, provisionId: 'insurance-id' })])
                expect(managerMocked.update).toHaveBeenCalledWith(Provision, { id: In(['insurance-id']) }, { lastGeneratedMonth: '2026-11' })
                expect(managerMocked.update).toHaveBeenCalledWith(Provision, 'insurance-id', { nextDueDate: '2027-11-15' })
            })

            it('should not move the next due date of a provision when only its transfer is generated', async () => {
                const provisionsAccount: Account = { id: 'provisions-id', name: 'Provisions', isPrimary: false, lastGeneratedMonth: null, createdAt }
                const insurance: Provision = { id: 'insurance-id', label: 'Assurance auto', totalAmount: 70000, frequencyMonths: 12, nextDueDate: '2027-03-15', startedAt: '2026-01-01', status: ProvisionStatus.ACTIVE, accountId: 'provisions-id', categoryId: null, lastGeneratedMonth: null, createdAt }
                mockRules({ accounts: [primary, provisionsAccount], incomes: [], fixedCharges: [], provisions: [insurance] })

                await planningService.generateForUser('user-id', today)

                expect(managerMocked.update).toHaveBeenCalledTimes(1)
                expect(managerMocked.update).toHaveBeenCalledWith(Provision, { id: In(['insurance-id']) }, { lastGeneratedMonth: '2026-11' })
            })

            it('should skip an installment already paid and keep its plan open', async () => {
                mockRules({ incomes: [], fixedCharges: [], installmentPlans: [iphone], paidInstallments: [{ installmentId: 'installment-2' }] })

                const response = await planningService.generateForUser('user-id', today)

                expect(response).toEqual(0)
                expect(managerMocked.find).toHaveBeenCalledWith(Transaction, { select: { installmentId: true }, where: { installmentId: In(['installment-2']) } })
                expect(managerMocked.save).not.toHaveBeenCalled()
                expect(managerMocked.update).not.toHaveBeenCalled()
            })

            it('should generate nothing for a user without primary account', async () => {
                mockRules({ accounts: [{ ...primary, isPrimary: false }] })

                const response = await planningService.generateForUser('user-id', today)

                expect(response).toEqual(0)
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should generate nothing for a deleted user', async () => {
                managerMocked.findOne.mockResolvedValueOnce(null)

                const response = await planningService.generateForUser('user-id', today)

                expect(response).toEqual(0)
                expect(managerMocked.find).not.toHaveBeenCalled()
            })
        })
    })

    describe('purgeStalePending', () => {
        describe('Success cases', () => {
            it('should delete the pending transactions dated before the previous month', async () => {
                transactionRepositoryMocked.delete.mockResolvedValueOnce({ affected: 3 })

                const response = await planningService.purgeStalePending(today)

                expect(response).toEqual(3)
                expect(transactionRepositoryMocked.delete).toHaveBeenCalledWith({ status: TransactionStatus.PENDING, occurredOn: LessThan('2026-10-01') })
            })
        })
    })

    describe('generateAll', () => {
        describe('Success cases', () => {
            it('should purge then generate for every user with a primary account once', async () => {
                transactionRepositoryMocked.delete.mockResolvedValueOnce({ affected: 0 })
                accountRepositoryMocked.find.mockResolvedValueOnce([{ userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-1' }])
                const generateForUser = jest.spyOn(planningService, 'generateForUser').mockResolvedValue(2)

                await planningService.generateAll(today)

                expect(accountRepositoryMocked.find).toHaveBeenCalledWith({ select: { userId: true }, where: { isPrimary: true } })
                expect(generateForUser.mock.calls).toEqual([['user-1', today], ['user-2', today]])
            })
        })

        describe('Failure cases', () => {
            it('should log a failing user and go on with the others', async () => {
                transactionRepositoryMocked.delete.mockResolvedValueOnce({ affected: 0 })
                accountRepositoryMocked.find.mockResolvedValueOnce([{ userId: 'user-1' }, { userId: 'user-2' }])
                const generateForUser = jest.spyOn(planningService, 'generateForUser').mockRejectedValueOnce(new Error('deadlock')).mockResolvedValueOnce(1)

                await planningService.generateAll(today)

                expect(generateForUser).toHaveBeenCalledTimes(2)
                expect(Logger.prototype.error).toHaveBeenCalledWith('Generation of the planned transactions failed for user user-1', expect.any(String))
            })

            it('should still generate when the purge fails', async () => {
                transactionRepositoryMocked.delete.mockRejectedValueOnce(new Error('timeout'))
                accountRepositoryMocked.find.mockResolvedValueOnce([{ userId: 'user-1' }])
                const generateForUser = jest.spyOn(planningService, 'generateForUser').mockResolvedValue(0)

                await planningService.generateAll(today)

                expect(generateForUser).toHaveBeenCalledWith('user-1', today)
                expect(Logger.prototype.error).toHaveBeenCalledWith('Purge of the stale pending transactions failed', expect.any(String))
            })
        })
    })
})
