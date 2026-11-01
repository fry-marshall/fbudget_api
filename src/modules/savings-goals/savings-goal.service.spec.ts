import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { SavingsGoal } from "./savings-goal.entity";
import { SavingsGoalService } from "./savings-goal.service";

describe('SavingsGoalService', () => {

    let managerMocked = {
        exists: jest.fn(),
    };
    let savingsGoalRepositoryMocked = {
        find: jest.fn(),
        findOne: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        manager: managerMocked,
    };
    let queryBuilderMocked = {
        select: jest.fn(),
        addSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        groupBy: jest.fn(),
        getRawMany: jest.fn(),
    };
    let transactionRepositoryMocked = {
        find: jest.fn(),
        save: jest.fn(),
        createQueryBuilder: jest.fn(),
    };
    let savingsGoalService: SavingsGoalService;

    const createdAt = new Date()
    const savingsGoalMocked: SavingsGoal = {
        id: 'savings-goal-id',
        label: 'Apport voiture',
        targetAmount: 300000,
        monthlyContribution: 20000,
        targetDate: '2027-10-01',
        accountId: 'account-id',
        userId: 'user-id',
        createdAt,
        updatedAt: createdAt,
    }
    const transactionMocked: Transaction = {
        id: 'transaction-id',
        amount: -20000,
        occurredOn: '2026-11-01',
        merchant: 'Apport voiture',
        accountId: 'account-id',
        sourceType: TransactionSourceType.SAVINGS,
        savingsGoalId: 'savings-goal-id',
        userId: 'user-id',
        createdAt,
    }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                SavingsGoalService,
                { provide: getRepositoryToken(SavingsGoal), useValue: savingsGoalRepositoryMocked },
                { provide: getRepositoryToken(Transaction), useValue: transactionRepositoryMocked },
            ]
        }).compile()

        savingsGoalService = moduleRef.get(SavingsGoalService)
    })

    beforeEach(() => {
        jest.resetAllMocks()
        transactionRepositoryMocked.createQueryBuilder.mockReturnValue(queryBuilderMocked)
        ;['select', 'addSelect', 'where', 'andWhere', 'groupBy'].forEach((method) => queryBuilderMocked[method].mockReturnValue(queryBuilderMocked))
        queryBuilderMocked.getRawMany.mockResolvedValue([])
    })

    describe('findAll', () => {
        describe('Success cases', () => {
            it('should return the savings goals with their current amount and progress', async () => {
                const livretA = { ...savingsGoalMocked, id: 'livret-id', label: 'Livret A', targetAmount: null, targetDate: null, accountId: null }
                savingsGoalRepositoryMocked.find.mockResolvedValueOnce([savingsGoalMocked, livretA])
                queryBuilderMocked.getRawMany.mockResolvedValueOnce([{ savingsGoalId: 'savings-goal-id', currentAmount: '120000' }])

                const response = await savingsGoalService.findAll('user-id')

                expect(response).toMatchObject([
                    { id: 'savings-goal-id', hasGoal: true, currentAmount: 120000, progressPct: 40 },
                    { id: 'livret-id', hasGoal: false, currentAmount: 0, progressPct: null, projectedMonth: null, targetAmount: null, targetDate: null, accountId: null },
                ])
                expect(queryBuilderMocked.andWhere).toHaveBeenCalledWith('transaction.savingsGoalId IN (:...savingsGoalIds)', { savingsGoalIds: ['savings-goal-id', 'livret-id'] })
                expect(queryBuilderMocked.andWhere).toHaveBeenCalledWith('transaction.status = :status', { status: TransactionStatus.CONFIRMED })
            })

            it('should not query the transactions when the user has no savings goal', async () => {
                savingsGoalRepositoryMocked.find.mockResolvedValueOnce([])

                expect(await savingsGoalService.findAll('user-id')).toEqual([])
                expect(transactionRepositoryMocked.createQueryBuilder).not.toHaveBeenCalled()
            })
        })
    })

    describe('create', () => {
        describe('Success cases', () => {
            it('should save a savings goal without target for the user', async () => {
                const body = { label: 'Livret A', monthlyContribution: 10000 }
                savingsGoalRepositoryMocked.save.mockResolvedValueOnce({ ...savingsGoalMocked, ...body, targetAmount: null, targetDate: null, accountId: null })

                const response = await savingsGoalService.create('user-id', body)

                expect(response).toMatchObject({ hasGoal: false, currentAmount: 0, progressPct: null, projectedMonth: null })
                expect(savingsGoalRepositoryMocked.save).toHaveBeenCalledWith({ ...body, userId: 'user-id' })
            })
        })

        describe('Failure cases', () => {
            it('should throw BadRequestException when a target date is sent without target amount', async () => {
                await expect(savingsGoalService.create('user-id', { label: 'Vacances', monthlyContribution: 10000, targetDate: '2027-07-01' })).rejects.toThrow(new BadRequestException(ERRORS_MESSAGES.SAVINGS_GOALS.TARGET_AMOUNT_REQUIRED))
                expect(savingsGoalRepositoryMocked.save).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when the account does not belong to the user', async () => {
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(savingsGoalService.create('user-id', { label: 'Vacances', monthlyContribution: 10000, accountId: 'account-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(managerMocked.exists).toHaveBeenCalledWith(Account, { where: { id: 'account-id', userId: 'user-id' } })
            })
        })
    })

    describe('update', () => {
        describe('Success cases', () => {
            it('should remove the target and the target date together', async () => {
                savingsGoalRepositoryMocked.findOne.mockResolvedValueOnce(savingsGoalMocked).mockResolvedValueOnce({ ...savingsGoalMocked, targetAmount: null, targetDate: null })

                const response = await savingsGoalService.update('user-id', 'savings-goal-id', { targetAmount: null, targetDate: null })

                expect(response).toMatchObject({ hasGoal: false, targetAmount: null, targetDate: null })
                expect(savingsGoalRepositoryMocked.update).toHaveBeenCalledWith('savings-goal-id', { targetAmount: null, targetDate: null })
            })
        })

        describe('Failure cases', () => {
            it('should throw BadRequestException when the target is removed but the stored target date is kept', async () => {
                savingsGoalRepositoryMocked.findOne.mockResolvedValueOnce(savingsGoalMocked)

                await expect(savingsGoalService.update('user-id', 'savings-goal-id', { targetAmount: null })).rejects.toThrow(new BadRequestException(ERRORS_MESSAGES.SAVINGS_GOALS.TARGET_AMOUNT_REQUIRED))
                expect(savingsGoalRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it('should throw BadRequestException when a target date is set on a goal without target', async () => {
                savingsGoalRepositoryMocked.findOne.mockResolvedValueOnce({ ...savingsGoalMocked, targetAmount: null, targetDate: null })

                await expect(savingsGoalService.update('user-id', 'savings-goal-id', { targetDate: '2027-07-01' })).rejects.toThrow(new BadRequestException(ERRORS_MESSAGES.SAVINGS_GOALS.TARGET_AMOUNT_REQUIRED))
            })

            it('should throw NotFoundException when savings goal doesn\'t belong to the user', async () => {
                savingsGoalRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(savingsGoalService.update('user-id', 'savings-goal-id', { label: 'Vacances' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND))
            })
        })
    })

    describe('remove', () => {
        describe('Success cases', () => {
            it('should delete the savings goal', async () => {
                savingsGoalRepositoryMocked.findOne.mockResolvedValueOnce(savingsGoalMocked)

                expect(await savingsGoalService.remove('user-id', 'savings-goal-id')).toEqual({ message: SUCCESS_MESSAGES.SAVINGS_GOAL.SAVINGS_GOAL_DELETED })
                expect(savingsGoalRepositoryMocked.delete).toHaveBeenCalledWith('savings-goal-id')
            })
        })
    })

    describe('contribute', () => {
        describe('Success cases', () => {
            it('should create a negative savings transaction on the account of the goal by default', async () => {
                savingsGoalRepositoryMocked.findOne.mockResolvedValueOnce(savingsGoalMocked)
                transactionRepositoryMocked.save.mockResolvedValueOnce(transactionMocked)
                queryBuilderMocked.getRawMany.mockResolvedValueOnce([{ savingsGoalId: 'savings-goal-id', currentAmount: '20000' }])

                const response = await savingsGoalService.contribute('user-id', 'savings-goal-id', { amount: 20000, occurredOn: '2026-11-01' })

                expect(transactionRepositoryMocked.save).toHaveBeenCalledWith({
                    amount: -20000,
                    occurredOn: '2026-11-01',
                    merchant: 'Apport voiture',
                    accountId: 'account-id',
                    sourceType: TransactionSourceType.SAVINGS,
                    status: TransactionStatus.CONFIRMED,
                    savingsGoalId: 'savings-goal-id',
                    userId: 'user-id',
                })
                expect(managerMocked.exists).not.toHaveBeenCalled()
                expect(response.savingsGoal).toMatchObject({ currentAmount: 20000, progressPct: 6 })
                expect(response.transaction).toMatchObject({ id: 'transaction-id', amount: -20000, savingsGoalId: 'savings-goal-id' })
            })
        })

        describe('Failure cases', () => {
            it('should throw BadRequestException when neither the body nor the goal has an account', async () => {
                savingsGoalRepositoryMocked.findOne.mockResolvedValueOnce({ ...savingsGoalMocked, accountId: null })

                await expect(savingsGoalService.contribute('user-id', 'savings-goal-id', { amount: 20000, occurredOn: '2026-11-01' })).rejects.toThrow(new BadRequestException(ERRORS_MESSAGES.SAVINGS_GOALS.ACCOUNT_REQUIRED))
                expect(transactionRepositoryMocked.save).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when the account sent does not belong to the user', async () => {
                savingsGoalRepositoryMocked.findOne.mockResolvedValueOnce(savingsGoalMocked)
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(savingsGoalService.contribute('user-id', 'savings-goal-id', { amount: 20000, occurredOn: '2026-11-01', accountId: 'other-account-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(transactionRepositoryMocked.save).not.toHaveBeenCalled()
            })
        })
    })

    describe('findContributions', () => {
        describe('Success cases', () => {
            it('should return the contributions of the savings goal, most recent first', async () => {
                savingsGoalRepositoryMocked.findOne.mockResolvedValueOnce(savingsGoalMocked)
                transactionRepositoryMocked.find.mockResolvedValueOnce([transactionMocked])

                const response = await savingsGoalService.findContributions('user-id', 'savings-goal-id')

                expect(response.map((transaction) => transaction.id)).toEqual(['transaction-id'])
                expect(transactionRepositoryMocked.find).toHaveBeenCalledWith({
                    where: { savingsGoalId: 'savings-goal-id', userId: 'user-id' },
                    order: { occurredOn: 'DESC', createdAt: 'DESC' }
                })
            })
        })
    })
})
