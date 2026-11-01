import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { DataSource, QueryFailedError } from "typeorm";
import { ERRORS_MESSAGES } from "src/common/constants";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { InstallmentPlan } from "./installment-plan.entity";
import { Installment } from "./installment.entity";
import { InstallmentPlanService } from "./installment-plan.service";
import { InstallmentPlanStatus, InstallmentStatus } from "./types";

describe('InstallmentPlanService', () => {

    let managerMocked = {
        find: jest.fn(),
        findOne: jest.fn(),
        exists: jest.fn(),
        save: jest.fn(),
    };
    let installmentPlanRepositoryMocked = {
        find: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        manager: managerMocked,
    };
    let transactionRepositoryMocked = {
        manager: managerMocked,
    };
    let dataSourceMocked = {
        transaction: jest.fn(),
    };
    let installmentPlanService: InstallmentPlanService;

    const createdAt = new Date()
    const installmentsMocked: Installment[] = [
        { id: 'installment-1', index: 1, dueDate: '2020-01-15', amount: 3333, planId: 'plan-id' },
        { id: 'installment-2', index: 2, dueDate: '2020-02-15', amount: 3333, planId: 'plan-id' },
        { id: 'installment-3', index: 3, dueDate: '2099-03-15', amount: 3334, planId: 'plan-id' },
    ]
    const planMocked: InstallmentPlan = {
        id: 'plan-id',
        label: 'Canapé',
        provider: null,
        totalAmount: 10000,
        installmentCount: 3,
        firstDueDate: '2020-01-15',
        status: InstallmentPlanStatus.ACTIVE,
        accountId: 'account-id',
        categoryId: null,
        userId: 'user-id',
        installments: installmentsMocked,
        createdAt,
    }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                InstallmentPlanService,
                { provide: getRepositoryToken(InstallmentPlan), useValue: installmentPlanRepositoryMocked },
                { provide: getRepositoryToken(Transaction), useValue: transactionRepositoryMocked },
                { provide: DataSource, useValue: dataSourceMocked },
            ]
        }).compile()

        installmentPlanService = moduleRef.get(InstallmentPlanService)
    })

    beforeEach(() => {
        jest.resetAllMocks()
        dataSourceMocked.transaction.mockImplementation((callback) => callback(managerMocked))
    })

    describe('findAll', () => {
        describe('Success cases', () => {
            it('should derive the status, the paid count, the remaining due and the next installment from the payments', async () => {
                installmentPlanRepositoryMocked.find.mockResolvedValueOnce([planMocked])
                managerMocked.find.mockResolvedValueOnce([{ id: 'transaction-1', occurredOn: '2020-01-14', installmentId: 'installment-1' }])

                const [plan] = await installmentPlanService.findAll('user-id')

                expect(plan).toMatchObject({
                    status: InstallmentPlanStatus.ACTIVE,
                    installmentAmount: 3333,
                    paidCount: 1,
                    remainingDue: 6667,
                    nextInstallment: { id: 'installment-2', status: InstallmentStatus.DUE, transactionId: null },
                })
            })

            it('should return a completed plan when every installment is paid', async () => {
                installmentPlanRepositoryMocked.find.mockResolvedValueOnce([planMocked])
                managerMocked.find.mockResolvedValueOnce(installmentsMocked.map((installment) => ({ id: `transaction-${installment.index}`, occurredOn: '2020-01-14', installmentId: installment.id })))

                const [plan] = await installmentPlanService.findAll('user-id')

                expect(plan).toMatchObject({ status: InstallmentPlanStatus.COMPLETED, paidCount: 3, remainingDue: 0, nextInstallment: null })
            })

            it('should not look for payments when the user has no plan', async () => {
                installmentPlanRepositoryMocked.find.mockResolvedValueOnce([])

                expect(await installmentPlanService.findAll('user-id')).toEqual([])
                expect(managerMocked.find).not.toHaveBeenCalled()
            })
        })
    })

    describe('create', () => {
        describe('Failure cases', () => {
            it('should throw BadRequestException when the total amount is lower than the number of installments', async () => {
                await expect(installmentPlanService.create('user-id', { label: 'Canapé', totalAmount: 2, installmentCount: 3, firstDueDate: '2026-11-15' })).rejects.toThrow(new BadRequestException(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST))
                expect(dataSourceMocked.transaction).not.toHaveBeenCalled()
            })
        })
    })

    describe('pay', () => {
        describe('Success cases', () => {
            it('should lock the plan and create the installment expense on the plan account', async () => {
                managerMocked.findOne.mockResolvedValueOnce(planMocked).mockResolvedValueOnce(installmentsMocked[2])
                managerMocked.exists.mockResolvedValueOnce(false)
                managerMocked.save.mockImplementationOnce((_, transaction) => ({ ...transaction, id: 'transaction-id', createdAt }))

                const response = await installmentPlanService.pay('user-id', 'plan-id', 'installment-3', { occurredOn: '2026-11-15' })

                expect(managerMocked.findOne).toHaveBeenNthCalledWith(1, InstallmentPlan, { where: { id: 'plan-id', userId: 'user-id' }, lock: { mode: 'pessimistic_write' } })
                expect(managerMocked.findOne).toHaveBeenNthCalledWith(2, Installment, { where: { id: 'installment-3', planId: 'plan-id' } })
                expect(managerMocked.save).toHaveBeenCalledWith(Transaction, {
                    amount: -3334,
                    occurredOn: '2026-11-15',
                    merchant: 'Canapé',
                    accountId: 'account-id',
                    categoryId: null,
                    sourceType: TransactionSourceType.INSTALLMENT,
                    status: TransactionStatus.CONFIRMED,
                    installmentId: 'installment-3',
                    userId: 'user-id',
                })
                expect(response.installment).toMatchObject({ id: 'installment-3', status: InstallmentStatus.PAID, transactionId: 'transaction-id', paidOn: '2026-11-15' })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when the plan doesn\'t belong to the user', async () => {
                managerMocked.findOne.mockResolvedValueOnce(null)

                await expect(installmentPlanService.pay('user-id', 'plan-id', 'installment-1', { occurredOn: '2026-11-15' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND))
            })

            it('should throw ConflictException when the plan is cancelled', async () => {
                managerMocked.findOne.mockResolvedValueOnce({ ...planMocked, status: InstallmentPlanStatus.CANCELLED })

                await expect(installmentPlanService.pay('user-id', 'plan-id', 'installment-1', { occurredOn: '2026-11-15' })).rejects.toThrow(new ConflictException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_CANCELLED))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when the installment is not in the plan', async () => {
                managerMocked.findOne.mockResolvedValueOnce(planMocked).mockResolvedValueOnce(null)

                await expect(installmentPlanService.pay('user-id', 'plan-id', 'other-installment', { occurredOn: '2026-11-15' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_NOT_FOUND))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should throw ConflictException when the installment is already paid', async () => {
                managerMocked.findOne.mockResolvedValueOnce(planMocked).mockResolvedValueOnce(installmentsMocked[0])
                managerMocked.exists.mockResolvedValueOnce(true)

                await expect(installmentPlanService.pay('user-id', 'plan-id', 'installment-1', { occurredOn: '2026-11-15' })).rejects.toThrow(new ConflictException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_ALREADY_PAID))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should throw ConflictException when the unique index rejects a second payment', async () => {
                managerMocked.findOne.mockResolvedValueOnce(planMocked).mockResolvedValueOnce(installmentsMocked[0])
                managerMocked.exists.mockResolvedValueOnce(false)
                managerMocked.save.mockRejectedValueOnce(new QueryFailedError('INSERT', [], Object.assign(new Error('query failed'), { code: '23505' })))

                await expect(installmentPlanService.pay('user-id', 'plan-id', 'installment-1', { occurredOn: '2026-11-15' })).rejects.toThrow(new ConflictException(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_ALREADY_PAID))
            })

            it('should throw BadRequestException when no account is available', async () => {
                managerMocked.findOne.mockResolvedValueOnce({ ...planMocked, accountId: null }).mockResolvedValueOnce(installmentsMocked[0])
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(installmentPlanService.pay('user-id', 'plan-id', 'installment-1', { occurredOn: '2026-11-15' })).rejects.toThrow(new BadRequestException(ERRORS_MESSAGES.INSTALLMENT_PLANS.ACCOUNT_REQUIRED))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })
        })
    })
})
