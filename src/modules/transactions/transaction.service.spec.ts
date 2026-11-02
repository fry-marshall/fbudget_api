import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { And, In, LessThan, MoreThanOrEqual, QueryFailedError } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { Transaction } from "./transaction.entity";
import { TransactionService } from "./transaction.service";
import { TransactionSourceType, TransactionStatus } from "./types";

describe('TransactionService', () => {

    let managerMocked = {
        exists: jest.fn(),
        transaction: jest.fn(),
        find: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
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
        managerMocked.transaction.mockImplementation((callback) => callback(managerMocked))
        managerMocked.save.mockImplementation((_entity, transactions) => Promise.resolve(transactions))
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
    describe('findPending', () => {
        describe('Success cases', () => {
            it('should return the pending transactions of the previous and the current month, oldest first', async () => {
                const pendingMocked = { ...transactionMocked, status: TransactionStatus.PENDING }
                transactionRepositoryMocked.find.mockResolvedValueOnce([pendingMocked])

                const response = await transactionService.findPending('user-id', new Date('2027-01-10T08:00:00Z'))

                expect(response).toStrictEqual([{ ...transactionDto, status: TransactionStatus.PENDING }])
                expect(transactionRepositoryMocked.find).toHaveBeenCalledWith({
                    where: { userId: 'user-id', status: TransactionStatus.PENDING, occurredOn: And(MoreThanOrEqual('2026-12-01'), LessThan('2027-02-01')) },
                    order: { occurredOn: 'ASC', createdAt: 'ASC', amount: 'ASC' }
                })
            })
        })
    })

    describe('confirm', () => {
        const pendingMocked: Transaction = { ...transactionMocked, amount: -85000, status: TransactionStatus.PENDING, sourceType: TransactionSourceType.FIXED_CHARGE }
        const debitLeg: Transaction = { ...pendingMocked, amount: -5834, sourceType: TransactionSourceType.TRANSFER, transferId: 'transfer-id' }
        const creditLeg: Transaction = { ...debitLeg, id: 'credit-id', amount: 5834, accountId: 'provisions-id' }

        describe('Success cases', () => {
            it('should confirm the transaction with its planned amount and day', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(pendingMocked)
                managerMocked.find.mockResolvedValueOnce([pendingMocked])

                const response = await transactionService.confirm('user-id', 'transaction-id', {})

                expect(response).toMatchObject({ id: 'transaction-id', amount: -85000, occurredOn: '2026-10-15', status: TransactionStatus.CONFIRMED })
                expect(managerMocked.find).toHaveBeenCalledWith(Transaction, { where: { id: 'transaction-id', userId: 'user-id' }, lock: { mode: 'pessimistic_write' } })
                expect(managerMocked.save).toHaveBeenCalledWith(Transaction, [{ ...pendingMocked, status: TransactionStatus.CONFIRMED }])
            })

            it.each([
                [-85000, 87000, -87000],
                [248000, 253000, 253000],
            ])('should keep the sign of the pending amount %p when confirmed with %p', async (pendingAmount, amount, expected) => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce({ ...pendingMocked, amount: pendingAmount })
                managerMocked.find.mockResolvedValueOnce([{ ...pendingMocked, amount: pendingAmount }])

                const response = await transactionService.confirm('user-id', 'transaction-id', { amount, occurredOn: '2026-10-16' })

                expect(response).toMatchObject({ amount: expected, occurredOn: '2026-10-16', status: TransactionStatus.CONFIRMED })
            })

            it('should confirm both transactions of a transfer with the same amount and day', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(creditLeg)
                managerMocked.find.mockResolvedValueOnce([debitLeg, creditLeg])

                const response = await transactionService.confirm('user-id', 'credit-id', { amount: 6000, occurredOn: '2026-10-29' })

                expect(response).toMatchObject({ id: 'credit-id', amount: 6000, occurredOn: '2026-10-29', status: TransactionStatus.CONFIRMED })
                expect(managerMocked.find).toHaveBeenCalledWith(Transaction, { where: { transferId: 'transfer-id', userId: 'user-id' }, lock: { mode: 'pessimistic_write' } })
                expect(managerMocked.save).toHaveBeenCalledWith(Transaction, [
                    { ...debitLeg, amount: -6000, occurredOn: '2026-10-29', status: TransactionStatus.CONFIRMED },
                    { ...creditLeg, amount: 6000, occurredOn: '2026-10-29', status: TransactionStatus.CONFIRMED },
                ])
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when transaction doesn\'t belong to the user', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(transactionService.confirm('user-id', 'transaction-id', {})).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when transaction is deleted before the lock', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(pendingMocked)
                managerMocked.find.mockResolvedValueOnce([])

                await expect(transactionService.confirm('user-id', 'transaction-id', {})).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should throw ConflictException when transaction is already confirmed', async () => {
                transactionRepositoryMocked.findOne.mockResolvedValueOnce(transactionMocked)
                managerMocked.find.mockResolvedValueOnce([transactionMocked])

                await expect(transactionService.confirm('user-id', 'transaction-id', {})).rejects.toThrow(new ConflictException(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_ALREADY_CONFIRMED))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })
        })
    })

    describe('confirmMany', () => {
        const pendingMocked: Transaction = { ...transactionMocked, status: TransactionStatus.PENDING }
        const debitLeg: Transaction = { ...pendingMocked, id: 'debit-id', amount: -5834, sourceType: TransactionSourceType.TRANSFER, transferId: 'transfer-id' }
        const creditLeg: Transaction = { ...debitLeg, id: 'credit-id', amount: 5834 }

        describe('Success cases', () => {
            it('should confirm the pending transactions with the other transaction of their transfers and ignore the confirmed ones', async () => {
                const confirmedMocked = { ...transactionMocked, id: 'confirmed-id' }
                managerMocked.find
                    .mockResolvedValueOnce([pendingMocked, debitLeg, confirmedMocked])
                    .mockResolvedValueOnce([pendingMocked, debitLeg, creditLeg, confirmedMocked])

                const response = await transactionService.confirmMany('user-id', { ids: ['transaction-id', 'debit-id', 'confirmed-id'] })

                expect(response.map(({ id, status }) => [id, status])).toEqual([
                    ['transaction-id', TransactionStatus.CONFIRMED],
                    ['debit-id', TransactionStatus.CONFIRMED],
                    ['credit-id', TransactionStatus.CONFIRMED],
                ])
                expect(managerMocked.find).toHaveBeenNthCalledWith(2, Transaction, {
                    where: [{ id: In(['transaction-id', 'debit-id', 'confirmed-id']), userId: 'user-id' }, { transferId: In(['transfer-id']), userId: 'user-id' }],
                    order: { occurredOn: 'ASC', createdAt: 'ASC', amount: 'ASC' },
                    lock: { mode: 'pessimistic_write' },
                })
                expect(managerMocked.update).toHaveBeenCalledWith(Transaction, { id: In(['transaction-id', 'debit-id', 'credit-id']) }, { status: TransactionStatus.CONFIRMED })
            })

            it('should return an empty list when every transaction is already confirmed', async () => {
                managerMocked.find.mockResolvedValueOnce([transactionMocked]).mockResolvedValueOnce([transactionMocked])

                const response = await transactionService.confirmMany('user-id', { ids: ['transaction-id'] })

                expect(response).toEqual([])
                expect(managerMocked.find).toHaveBeenNthCalledWith(2, Transaction, expect.objectContaining({ where: [{ id: In(['transaction-id']), userId: 'user-id' }] }))
                expect(managerMocked.update).not.toHaveBeenCalled()
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException and confirm nothing when a transaction doesn\'t belong to the user', async () => {
                managerMocked.find.mockResolvedValueOnce([pendingMocked])

                await expect(transactionService.confirmMany('user-id', { ids: ['transaction-id', 'other-id'] })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND))
                expect(managerMocked.update).not.toHaveBeenCalled()
            })
        })
    })
})
