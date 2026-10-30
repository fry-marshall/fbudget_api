import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { User } from "../users/user.entity";
import { Account } from "./account.entity";
import { AccountService } from "./account.service";
import { AccountType } from "./types";
import { Transaction } from "../transactions/transaction.entity";

describe('AccountService', () => {

    let managerMocked = {
        findOne: jest.fn(),
        findOneByOrFail: jest.fn(),
        exists: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    };
    let accountRepositoryMocked = {
        find: jest.fn(),
        findOneBy: jest.fn(),
        update: jest.fn(),
        manager: managerMocked,
    };
    let transactionRepositoryMocked = {
        createQueryBuilder: jest.fn(),
    };
    let dataSourceMocked = {
        transaction: jest.fn((callback) => callback(managerMocked)),
    };
    let accountService: AccountService;

    const userMocked: User = { id: 'user-id', email: 'test@gmail.com' }
    const createdAt = new Date()
    const accountMocked: Account = {
        id: 'account-id',
        type: AccountType.CARD,
        name: 'Visa *4782',
        initialBalance: 150000,
        isPrimary: false,
        userId: 'user-id',
        createdAt,
        updatedAt: createdAt,
    }
    const accountDto = {
        id: 'account-id',
        type: AccountType.CARD,
        operator: null,
        name: 'Visa *4782',
        last4: null,
        country: null,
        initialBalance: 150000,
        isPrimary: false,
        createdAt,
    }
    const createAccountDto = { type: AccountType.CARD, name: 'Visa *4782', initialBalance: 150000 }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                AccountService,
                { provide: getRepositoryToken(Account), useValue: accountRepositoryMocked },
                { provide: getRepositoryToken(Transaction), useValue: transactionRepositoryMocked },
                { provide: DataSource, useValue: dataSourceMocked },
            ]
        }).compile()

        accountService = moduleRef.get(AccountService)
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('findAll', () => {
        describe('Success cases', () => {
            it('should return the user accounts oldest first without the user fields', async () => {
                accountRepositoryMocked.find = jest.fn().mockResolvedValue([accountMocked])

                const response = await accountService.findAll('user-id')

                expect(response).toStrictEqual([accountDto])
                expect(accountRepositoryMocked.find).toHaveBeenCalledWith({ where: { userId: 'user-id' }, order: { createdAt: 'ASC' } })
            })
        })

        describe('Failure cases', () => {
            it('should throw Error when find fails', async () => {
                accountRepositoryMocked.find = jest.fn().mockRejectedValue(new Error('An error has occured'))

                await expect(accountService.findAll('user-id')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('create', () => {
        describe('Success cases', () => {
            it('should create the first account as primary after locking the user', async () => {
                managerMocked.findOne.mockResolvedValueOnce(userMocked)
                managerMocked.exists.mockResolvedValueOnce(false)
                managerMocked.save.mockResolvedValueOnce({ ...accountMocked, isPrimary: true })

                const response = await accountService.create('user-id', createAccountDto)

                expect(response).toStrictEqual({ ...accountDto, isPrimary: true })
                expect(managerMocked.findOne).toHaveBeenCalledWith(User, { where: { id: 'user-id' }, lock: { mode: 'pessimistic_write' } })
                expect(managerMocked.save).toHaveBeenCalledWith(Account, { ...createAccountDto, userId: 'user-id', isPrimary: true })
            })

            it('should not make the account primary when the user already has one', async () => {
                managerMocked.findOne.mockResolvedValueOnce(userMocked)
                managerMocked.exists.mockResolvedValueOnce(true)
                managerMocked.save.mockResolvedValueOnce(accountMocked)

                const response = await accountService.create('user-id', createAccountDto)

                expect(response.isPrimary).toBe(false)
                expect(managerMocked.save).toHaveBeenCalledWith(Account, { ...createAccountDto, userId: 'user-id', isPrimary: false })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when user doesn\'t exist', async () => {
                managerMocked.findOne.mockResolvedValueOnce(null)

                await expect(accountService.create('user-id', createAccountDto)).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should throw Error when save fails', async () => {
                managerMocked.findOne.mockResolvedValueOnce(userMocked)
                managerMocked.exists.mockResolvedValueOnce(false)
                managerMocked.save.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(accountService.create('user-id', createAccountDto)).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('update', () => {
        describe('Success cases', () => {
            it('should update the account and return it', async () => {
                managerMocked.findOne.mockResolvedValueOnce(accountMocked)
                accountRepositoryMocked.update = jest.fn().mockResolvedValue(null)
                accountRepositoryMocked.findOneBy = jest.fn().mockResolvedValue({ ...accountMocked, name: 'Renamed' })

                const response = await accountService.update('user-id', 'account-id', { name: 'Renamed' })

                expect(response).toStrictEqual({ ...accountDto, name: 'Renamed' })
                expect(managerMocked.findOne).toHaveBeenCalledWith(Account, { where: { id: 'account-id', userId: 'user-id' } })
                expect(accountRepositoryMocked.update).toHaveBeenCalledWith('account-id', { name: 'Renamed' })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when account doesn\'t belong to the user', async () => {
                managerMocked.findOne.mockResolvedValueOnce(null)
                accountRepositoryMocked.update = jest.fn()

                await expect(accountService.update('user-id', 'account-id', { name: 'Renamed' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(accountRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it('should throw Error when update fails', async () => {
                managerMocked.findOne.mockResolvedValueOnce(accountMocked)
                accountRepositoryMocked.update = jest.fn().mockRejectedValue(new Error('An error has occured'))

                await expect(accountService.update('user-id', 'account-id', { name: 'Renamed' })).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('getBalance', () => {
        const mockTransactionsTotal = (total: string) => {
            const queryBuilder = {
                select: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                getRawOne: jest.fn().mockResolvedValue({ total }),
            }
            transactionRepositoryMocked.createQueryBuilder.mockReturnValueOnce(queryBuilder)
            return queryBuilder
        }

        describe('Success cases', () => {
            it('should add the signed transactions total to the initial balance', async () => {
                managerMocked.findOne.mockResolvedValueOnce(accountMocked)
                const queryBuilder = mockTransactionsTotal('-42500')

                const response = await accountService.getBalance('user-id', 'account-id')

                expect(response).toStrictEqual({ accountId: 'account-id', initialBalance: 150000, balance: 107500 })
                expect(managerMocked.findOne).toHaveBeenCalledWith(Account, { where: { id: 'account-id', userId: 'user-id' } })
                expect(queryBuilder.where).toHaveBeenCalledWith('transaction.accountId = :accountId', { accountId: 'account-id' })
            })

            it('should return the initial balance when the account has no transaction', async () => {
                managerMocked.findOne.mockResolvedValueOnce(accountMocked)
                mockTransactionsTotal('0')

                const response = await accountService.getBalance('user-id', 'account-id')

                expect(response.balance).toBe(150000)
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when account doesn\'t belong to the user', async () => {
                managerMocked.findOne.mockResolvedValueOnce(null)

                await expect(accountService.getBalance('user-id', 'account-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(transactionRepositoryMocked.createQueryBuilder).not.toHaveBeenCalled()
            })
        })
    })

    describe('setPrimary', () => {
        describe('Success cases', () => {
            it('should unset the previous primary account then set the requested one', async () => {
                managerMocked.findOne.mockResolvedValueOnce(userMocked).mockResolvedValueOnce(accountMocked)
                managerMocked.findOneByOrFail.mockResolvedValueOnce({ ...accountMocked, isPrimary: true })

                const response = await accountService.setPrimary('user-id', 'account-id')

                expect(response).toStrictEqual({ ...accountDto, isPrimary: true })
                expect(managerMocked.update).toHaveBeenNthCalledWith(1, Account, { userId: 'user-id', isPrimary: true }, { isPrimary: false })
                expect(managerMocked.update).toHaveBeenNthCalledWith(2, Account, 'account-id', { isPrimary: true })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when user doesn\'t exist', async () => {
                managerMocked.findOne.mockResolvedValueOnce(null)

                await expect(accountService.setPrimary('user-id', 'account-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(managerMocked.update).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when account doesn\'t belong to the user', async () => {
                managerMocked.findOne.mockResolvedValueOnce(userMocked).mockResolvedValueOnce(null)

                await expect(accountService.setPrimary('user-id', 'account-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(managerMocked.update).not.toHaveBeenCalled()
            })
        })
    })

    describe('remove', () => {
        describe('Success cases', () => {
            it('should delete a secondary account without changing the primary one', async () => {
                managerMocked.findOne.mockResolvedValueOnce(userMocked).mockResolvedValueOnce(accountMocked)

                const response = await accountService.remove('user-id', 'account-id')

                expect(response.message).toBe(SUCCESS_MESSAGES.ACCOUNT.ACCOUNT_DELETED)
                expect(managerMocked.delete).toHaveBeenCalledWith(Account, 'account-id')
                expect(managerMocked.update).not.toHaveBeenCalled()
            })

            it('should make the oldest remaining account primary when deleting the primary one', async () => {
                managerMocked.findOne
                    .mockResolvedValueOnce(userMocked)
                    .mockResolvedValueOnce({ ...accountMocked, isPrimary: true })
                    .mockResolvedValueOnce({ ...accountMocked, id: 'oldest-id' })

                await accountService.remove('user-id', 'account-id')

                expect(managerMocked.findOne).toHaveBeenLastCalledWith(Account, { where: { userId: 'user-id' }, order: { createdAt: 'ASC' } })
                expect(managerMocked.update).toHaveBeenCalledWith(Account, 'oldest-id', { isPrimary: true })
            })

            it('should not promote any account when deleting the last one', async () => {
                managerMocked.findOne
                    .mockResolvedValueOnce(userMocked)
                    .mockResolvedValueOnce({ ...accountMocked, isPrimary: true })
                    .mockResolvedValueOnce(null)

                await accountService.remove('user-id', 'account-id')

                expect(managerMocked.delete).toHaveBeenCalledWith(Account, 'account-id')
                expect(managerMocked.update).not.toHaveBeenCalled()
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when user doesn\'t exist', async () => {
                managerMocked.findOne.mockResolvedValueOnce(null)

                await expect(accountService.remove('user-id', 'account-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(managerMocked.delete).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when account doesn\'t belong to the user', async () => {
                managerMocked.findOne.mockResolvedValueOnce(userMocked).mockResolvedValueOnce(null)

                await expect(accountService.remove('user-id', 'account-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(managerMocked.delete).not.toHaveBeenCalled()
            })

            it('should throw Error when delete fails', async () => {
                managerMocked.findOne.mockResolvedValueOnce(userMocked).mockResolvedValueOnce(accountMocked)
                managerMocked.delete.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(accountService.remove('user-id', 'account-id')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })
})
