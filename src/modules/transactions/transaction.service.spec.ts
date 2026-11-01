import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { And, LessThan, MoreThanOrEqual, QueryFailedError } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { Transaction } from "./transaction.entity";
import { TransactionService } from "./transaction.service";
import { TransactionSourceType, TransactionStatus } from "./types";

describe('TransactionService', () => {

    let managerMocked = {
        exists: jest.fn(),
    };
    let transactionRepositoryMocked = {
        find: jest.fn(),
        findOne: jest.fn(),
        findOneBy: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        manager: managerMocked,
    };
    let transactionService: TransactionService;

    const createdAt = new Date()
    const transactionMocked: Transaction = {
        id: 'transaction-id',
        amount: -4250,
        occurredOn: '2026-10-15',
        accountId: 'account-id',
        categoryId: null,
        merchant: null,
        note: null,
        tags: [],
        sourceType: TransactionSourceType.MANUAL,
        status: TransactionStatus.CONFIRMED,
        userId: 'user-id',
        createdAt,
        updatedAt: createdAt,
    }
    const transactionDto = {
        id: 'transaction-id',
        amount: -4250,
        occurredOn: '2026-10-15',
        accountId: 'account-id',
        categoryId: null,
        merchant: null,
        note: null,
        tags: [],
        sourceType: TransactionSourceType.MANUAL,
        provisionId: null,
        installmentId: null,
        savingsGoalId: null,
        transferId: null,
        fixedChargeId: null,
        incomeId: null,
        status: TransactionStatus.CONFIRMED,
        createdAt,
    }
    const createBody = { amount: -4250, occurredOn: '2026-10-15', accountId: 'account-id' }

    const foreignKeyError = (detail: string) => new QueryFailedError('INSERT', [], Object.assign(new Error('query failed'), { code: '23503', detail }))

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                TransactionService,
                { provide: getRepositoryToken(Transaction), useValue: transactionRepositoryMocked },
            ]
        }).compile()

        transactionService = moduleRef.get(TransactionService)
    })

    beforeEach(() => {
        jest.resetAllMocks()
    })

    describe('findAll', () => {
        describe('Success cases', () => {
            it('should return the user transactions of the month, most recent first', async () => {
                transactionRepositoryMocked.find.mockResolvedValueOnce([transactionMocked])

                const response = await transactionService.findAll('user-id', { month: '2026-10', accountId: 'account-id' })

                expect(response).toStrictEqual([transactionDto])
                expect(transactionRepositoryMocked.find).toHaveBeenCalledWith({
                    where: { userId: 'user-id', accountId: 'account-id', occurredOn: And(MoreThanOrEqual('2026-10-01'), LessThan('2026-11-01')) },
                    order: { occurredOn: 'DESC', createdAt: 'DESC' }
                })
            })

            it('should end december on the first day of the next year', async () => {
                transactionRepositoryMocked.find.mockResolvedValueOnce([])

                await transactionService.findAll('user-id', { month: '2026-12' })

                expect(transactionRepositoryMocked.find.mock.lastCall[0].where.occurredOn).toEqual(And(MoreThanOrEqual('2026-12-01'), LessThan('2027-01-01')))
            })
        })

        describe('Failure cases', () => {
            it('should throw Error when find fails', async () => {
                transactionRepositoryMocked.find.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(transactionService.findAll('user-id', { month: '2026-10' })).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('create', () => {
        describe('Success cases', () => {
            it('should check the account, save a manual transaction for the user and return it', async () => {
                managerMocked.exists.mockResolvedValueOnce(true)
                transactionRepositoryMocked.save.mockResolvedValueOnce(transactionMocked)

                const response = await transactionService.create('user-id', createBody)

                expect(response).toStrictEqual(transactionDto)
                expect(managerMocked.exists).toHaveBeenCalledWith(Account, { where: { id: 'account-id', userId: 'user-id' } })
                expect(transactionRepositoryMocked.save).toHaveBeenCalledWith({ ...createBody, sourceType: TransactionSourceType.MANUAL, status: TransactionStatus.CONFIRMED, userId: 'user-id' })
            })

            it('should check the category belongs to the user', async () => {
                managerMocked.exists.mockResolvedValue(true)
                transactionRepositoryMocked.save.mockResolvedValueOnce({ ...transactionMocked, categoryId: 'category-id' })

                const response = await transactionService.create('user-id', { ...createBody, categoryId: 'category-id' })

                expect(response.categoryId).toBe('category-id')
                expect(managerMocked.exists).toHaveBeenCalledWith(Category, { where: { id: 'category-id', userId: 'user-id' } })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when account doesn\'t belong to the user', async () => {
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(transactionService.create('user-id', createBody)).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(transactionRepositoryMocked.save).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when category doesn\'t belong to the user', async () => {
                managerMocked.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

                await expect(transactionService.create('user-id', { ...createBody, categoryId: 'category-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND))
                expect(transactionRepositoryMocked.save).not.toHaveBeenCalled()
            })

            it.each([
                ['user', 'Key (userId)=(user-id) is not present in table "users".', ERRORS_MESSAGES.AUTH.USER_NOT_FOUND],
                ['account', 'Key (accountId)=(account-id) is not present in table "accounts".', ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND],
                ['category', 'Key (categoryId)=(category-id) is not present in table "categories".', ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND],
            ])('should throw NotFoundException when the %s is deleted before saving', async (_, detail, message) => {
                managerMocked.exists.mockResolvedValue(true)
                transactionRepositoryMocked.save.mockRejectedValueOnce(foreignKeyError(detail))

                await expect(transactionService.create('user-id', { ...createBody, categoryId: 'category-id' })).rejects.toThrow(new NotFoundException(message))
            })

            it('should throw Error when save fails', async () => {
                managerMocked.exists.mockResolvedValueOnce(true)
                transactionRepositoryMocked.save.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(transactionService.create('user-id', createBody)).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('update', () => {
        describe('Success cases', () => {
            it('should update the transaction and return it', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(transactionMocked)
                transactionRepositoryMocked.findOneBy.mockResolvedValueOnce({ ...transactionMocked, amount: -5000 })

                const response = await transactionService.update('user-id', 'transaction-id', { amount: -5000 })

                expect(response).toStrictEqual({ ...transactionDto, amount: -5000 })
                expect(transactionRepositoryMocked.findOne).toHaveBeenCalledWith({ where: { id: 'transaction-id', userId: 'user-id' } })
                expect(transactionRepositoryMocked.update).toHaveBeenCalledWith('transaction-id', { amount: -5000 })
                expect(managerMocked.exists).not.toHaveBeenCalled()
            })

            it('should unlink the category without checking it', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce({ ...transactionMocked, categoryId: 'category-id' })
                transactionRepositoryMocked.findOneBy.mockResolvedValueOnce(transactionMocked)

                const response = await transactionService.update('user-id', 'transaction-id', { categoryId: null })

                expect(response).toStrictEqual(transactionDto)
                expect(managerMocked.exists).not.toHaveBeenCalled()
            })

            it('should update the note of a transaction of a transfer', async () => {
                const transferLeg = { ...transactionMocked, sourceType: TransactionSourceType.TRANSFER, transferId: 'transfer-id' }
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(transferLeg)
                transactionRepositoryMocked.findOneBy.mockResolvedValueOnce({ ...transferLeg, note: 'Provisions' })

                const response = await transactionService.update('user-id', 'transaction-id', { note: 'Provisions', tags: ['provisions'] })

                expect(response).toMatchObject({ note: 'Provisions', transferId: 'transfer-id' })
                expect(transactionRepositoryMocked.update).toHaveBeenCalledWith('transaction-id', { note: 'Provisions', tags: ['provisions'] })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when transaction doesn\'t belong to the user', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(transactionService.update('user-id', 'transaction-id', { amount: -5000 })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND))
                expect(transactionRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it.each([
                ['amount', -5000],
                ['occurredOn', '2026-11-05'],
                ['accountId', 'other-account-id'],
                ['categoryId', null],
            ])('should throw ConflictException when %s of a transaction of a transfer changes', async (field, value) => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce({ ...transactionMocked, transferId: 'transfer-id' })

                await expect(transactionService.update('user-id', 'transaction-id', { [field]: value })).rejects.toThrow(new ConflictException(ERRORS_MESSAGES.TRANSACTIONS.TRANSFER_NOT_EDITABLE))
                expect(transactionRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when the new account doesn\'t belong to the user', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(transactionMocked)
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(transactionService.update('user-id', 'transaction-id', { accountId: 'other-account-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(transactionRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when the account is deleted before updating', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(transactionMocked)
                managerMocked.exists.mockResolvedValueOnce(true)
                transactionRepositoryMocked.update.mockRejectedValueOnce(foreignKeyError('Key (accountId)=(other-account-id) is not present in table "accounts".'))

                await expect(transactionService.update('user-id', 'transaction-id', { accountId: 'other-account-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
            })

            it('should throw Error when update fails', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(transactionMocked)
                transactionRepositoryMocked.update.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(transactionService.update('user-id', 'transaction-id', { amount: -5000 })).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('remove', () => {
        describe('Success cases', () => {
            it('should delete the transaction', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(transactionMocked)

                const response = await transactionService.remove('user-id', 'transaction-id')

                expect(response.message).toBe(SUCCESS_MESSAGES.TRANSACTION.TRANSACTION_DELETED)
                expect(transactionRepositoryMocked.delete).toHaveBeenCalledWith('transaction-id')
            })

            it('should delete both transactions of a transfer', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce({ ...transactionMocked, transferId: 'transfer-id' })

                await transactionService.remove('user-id', 'transaction-id')

                expect(transactionRepositoryMocked.delete).toHaveBeenCalledWith({ transferId: 'transfer-id', userId: 'user-id' })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when transaction doesn\'t belong to the user', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(transactionService.remove('user-id', 'transaction-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND))
                expect(transactionRepositoryMocked.delete).not.toHaveBeenCalled()
            })

            it('should throw Error when delete fails', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(transactionMocked)
                transactionRepositoryMocked.delete.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(transactionService.remove('user-id', 'transaction-id')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })
})
