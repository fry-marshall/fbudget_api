import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Income } from "./income.entity";
import { IncomeService } from "./income.service";

describe('IncomeService', () => {

    let managerMocked = {
        exists: jest.fn(),
    };
    let incomeRepositoryMocked = {
        find: jest.fn(),
        findOne: jest.fn(),
        findOneBy: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        manager: managerMocked,
    };
    let incomeService: IncomeService;

    const createdAt = new Date()
    const incomeMocked: Income = {
        id: 'income-id',
        label: 'Salaire',
        amount: 248000,
        dayOfMonth: 28,
        isVariable: false,
        accountId: null,
        userId: 'user-id',
        createdAt,
        updatedAt: createdAt,
    }
    const incomeDto = {
        id: 'income-id',
        label: 'Salaire',
        amount: 248000,
        dayOfMonth: 28,
        isVariable: false,
        accountId: null,
        createdAt,
    }

    const foreignKeyError = (detail: string) => new QueryFailedError('INSERT', [], Object.assign(new Error('query failed'), { code: '23503', detail }))

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                IncomeService,
                { provide: getRepositoryToken(Income), useValue: incomeRepositoryMocked },
            ]
        }).compile()

        incomeService = moduleRef.get(IncomeService)
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('findAll', () => {
        describe('Success cases', () => {
            it('should return the user incomes oldest first without the user fields', async () => {
                incomeRepositoryMocked.find.mockResolvedValueOnce([incomeMocked])

                const response = await incomeService.findAll('user-id')

                expect(response).toStrictEqual([incomeDto])
                expect(incomeRepositoryMocked.find).toHaveBeenCalledWith({ where: { userId: 'user-id' }, order: { createdAt: 'ASC' } })
            })
        })

        describe('Failure cases', () => {
            it('should throw Error when find fails', async () => {
                incomeRepositoryMocked.find.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(incomeService.findAll('user-id')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('create', () => {
        describe('Success cases', () => {
            it('should save the income for the user without checking an account', async () => {
                incomeRepositoryMocked.save.mockResolvedValueOnce(incomeMocked)

                const response = await incomeService.create('user-id', { label: 'Salaire', amount: 248000, dayOfMonth: 28 })

                expect(response).toStrictEqual(incomeDto)
                expect(managerMocked.exists).not.toHaveBeenCalled()
                expect(incomeRepositoryMocked.save).toHaveBeenCalledWith({ label: 'Salaire', amount: 248000, dayOfMonth: 28, userId: 'user-id' })
            })

            it('should check the account belongs to the user before saving', async () => {
                managerMocked.exists.mockResolvedValueOnce(true)
                incomeRepositoryMocked.save.mockResolvedValueOnce({ ...incomeMocked, accountId: 'account-id' })

                const response = await incomeService.create('user-id', { label: 'Salaire', amount: 248000, accountId: 'account-id' })

                expect(response).toStrictEqual({ ...incomeDto, accountId: 'account-id' })
                expect(managerMocked.exists).toHaveBeenCalledWith(Account, { where: { id: 'account-id', userId: 'user-id' } })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when account doesn\'t belong to the user', async () => {
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(incomeService.create('user-id', { label: 'Salaire', amount: 248000, accountId: 'account-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(incomeRepositoryMocked.save).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when user doesn\'t exist', async () => {
                incomeRepositoryMocked.save.mockRejectedValueOnce(foreignKeyError('Key (userId)=(user-id) is not present in table "users".'))

                await expect(incomeService.create('user-id', { label: 'Salaire', amount: 248000 })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND))
            })

            it('should throw NotFoundException when account is deleted before saving', async () => {
                managerMocked.exists.mockResolvedValueOnce(true)
                incomeRepositoryMocked.save.mockRejectedValueOnce(foreignKeyError('Key (accountId)=(account-id) is not present in table "accounts".'))

                await expect(incomeService.create('user-id', { label: 'Salaire', amount: 248000, accountId: 'account-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
            })

            it('should throw Error when save fails', async () => {
                incomeRepositoryMocked.save.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(incomeService.create('user-id', { label: 'Salaire', amount: 248000 })).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('update', () => {
        describe('Success cases', () => {
            it('should update the income and return it', async () => {
                incomeRepositoryMocked.findOne.mockResolvedValueOnce(incomeMocked)
                incomeRepositoryMocked.findOneBy.mockResolvedValueOnce({ ...incomeMocked, amount: 250000 })

                const response = await incomeService.update('user-id', 'income-id', { amount: 250000 })

                expect(response).toStrictEqual({ ...incomeDto, amount: 250000 })
                expect(incomeRepositoryMocked.findOne).toHaveBeenCalledWith({ where: { id: 'income-id', userId: 'user-id' } })
                expect(incomeRepositoryMocked.update).toHaveBeenCalledWith('income-id', { amount: 250000 })
                expect(managerMocked.exists).not.toHaveBeenCalled()
            })

            it('should unlink the account without checking it', async () => {
                incomeRepositoryMocked.findOne.mockResolvedValueOnce({ ...incomeMocked, accountId: 'account-id' })
                incomeRepositoryMocked.findOneBy.mockResolvedValueOnce(incomeMocked)

                const response = await incomeService.update('user-id', 'income-id', { accountId: null })

                expect(response).toStrictEqual(incomeDto)
                expect(managerMocked.exists).not.toHaveBeenCalled()
                expect(incomeRepositoryMocked.update).toHaveBeenCalledWith('income-id', { accountId: null })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when income doesn\'t belong to the user', async () => {
                incomeRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(incomeService.update('user-id', 'income-id', { amount: 250000 })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.INCOMES.INCOME_NOT_FOUND))
                expect(incomeRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when account doesn\'t belong to the user', async () => {
                incomeRepositoryMocked.findOne.mockResolvedValueOnce(incomeMocked)
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(incomeService.update('user-id', 'income-id', { accountId: 'account-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(incomeRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when account is deleted before updating', async () => {
                incomeRepositoryMocked.findOne.mockResolvedValueOnce(incomeMocked)
                managerMocked.exists.mockResolvedValueOnce(true)
                incomeRepositoryMocked.update.mockRejectedValueOnce(foreignKeyError('Key (accountId)=(account-id) is not present in table "accounts".'))

                await expect(incomeService.update('user-id', 'income-id', { accountId: 'account-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
            })

            it('should throw Error when update fails', async () => {
                incomeRepositoryMocked.findOne.mockResolvedValueOnce(incomeMocked)
                incomeRepositoryMocked.update.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(incomeService.update('user-id', 'income-id', { amount: 250000 })).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('remove', () => {
        describe('Success cases', () => {
            it('should delete the income', async () => {
                incomeRepositoryMocked.findOne.mockResolvedValueOnce(incomeMocked)

                const response = await incomeService.remove('user-id', 'income-id')

                expect(response.message).toBe(SUCCESS_MESSAGES.INCOME.INCOME_DELETED)
                expect(incomeRepositoryMocked.delete).toHaveBeenCalledWith('income-id')
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when income doesn\'t belong to the user', async () => {
                incomeRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(incomeService.remove('user-id', 'income-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.INCOMES.INCOME_NOT_FOUND))
                expect(incomeRepositoryMocked.delete).not.toHaveBeenCalled()
            })

            it('should throw Error when delete fails', async () => {
                incomeRepositoryMocked.findOne.mockResolvedValueOnce(incomeMocked)
                incomeRepositoryMocked.delete.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(incomeService.remove('user-id', 'income-id')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })
})
