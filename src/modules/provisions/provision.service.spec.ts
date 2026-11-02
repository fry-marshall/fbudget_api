import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { DataSource, In } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { Provision } from "./provision.entity";
import { ProvisionService } from "./provision.service";
import { ProvisionStatus } from "./types";

describe('ProvisionService', () => {

    let queryBuilderMocked = {
        innerJoin: jest.fn(),
        select: jest.fn(),
        addSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        groupBy: jest.fn(),
        getRawMany: jest.fn(),
    };
    let managerMocked = {
        createQueryBuilder: jest.fn(),
        findOne: jest.fn(),
        exists: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
    };
    let provisionRepositoryMocked = {
        find: jest.fn(),
        findOne: jest.fn(),
        findOneBy: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        manager: managerMocked,
    };
    let transactionRepositoryMocked = {
        find: jest.fn(),
    };
    let dataSourceMocked = {
        transaction: jest.fn(),
    };
    let provisionService: ProvisionService;

    const createdAt = new Date()
    const provisionMocked: Provision = {
        id: 'provision-id',
        label: 'Assurance auto',
        totalAmount: 70000,
        frequencyMonths: 12,
        nextDueDate: '2027-03-15',
        startedAt: '2026-11-01',
        status: ProvisionStatus.ACTIVE,
        accountId: 'account-id',
        categoryId: null,
        userId: 'user-id',
        createdAt,
        updatedAt: createdAt,
    }
    const provisionDto = {
        id: 'provision-id',
        label: 'Assurance auto',
        totalAmount: 70000,
        frequencyMonths: 12,
        monthlyAmount: 5834,
        reservedAmount: 0,
        progressPct: 0,
        nextDueDate: '2027-03-15',
        startedAt: '2026-11-01',
        status: ProvisionStatus.ACTIVE,
        accountId: 'account-id',
        categoryId: null,
        createdAt,
    }
    const transactionMocked: Transaction = {
        id: 'transaction-id',
        amount: -70000,
        occurredOn: '2027-03-14',
        merchant: 'Assurance auto',
        accountId: 'account-id',
        categoryId: null,
        sourceType: TransactionSourceType.PROVISION,
        provisionId: 'provision-id',
        userId: 'user-id',
        createdAt,
    }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                ProvisionService,
                { provide: getRepositoryToken(Provision), useValue: provisionRepositoryMocked },
                { provide: getRepositoryToken(Transaction), useValue: transactionRepositoryMocked },
                { provide: DataSource, useValue: dataSourceMocked },
            ]
        }).compile()

        provisionService = moduleRef.get(ProvisionService)
    })

    beforeEach(() => {
        jest.resetAllMocks()
        dataSourceMocked.transaction.mockImplementation((callback) => callback(managerMocked))
        managerMocked.createQueryBuilder.mockReturnValue(queryBuilderMocked)
        for (const method of ['innerJoin', 'select', 'addSelect', 'where', 'andWhere', 'groupBy'] as const) {
            queryBuilderMocked[method].mockReturnValue(queryBuilderMocked)
        }
        queryBuilderMocked.getRawMany.mockResolvedValue([])
    })

    describe('findAll', () => {
        describe('Success cases', () => {
            it('should return the active and paused provisions with their monthly amount', async () => {
                provisionRepositoryMocked.find.mockResolvedValueOnce([provisionMocked])

                const response = await provisionService.findAll('user-id')

                expect(response).toStrictEqual([provisionDto])
                expect(provisionRepositoryMocked.find).toHaveBeenCalledWith({
                    where: { userId: 'user-id', status: In([ProvisionStatus.ACTIVE, ProvisionStatus.PAUSED]) },
                    order: { nextDueDate: 'ASC', createdAt: 'ASC' }
                })
            })
        })
    })

    describe('reservedAmount', () => {
        describe('Success cases', () => {
            it('should sum the confirmed transfers received and payments of each provision on its dedicated account', async () => {
                provisionRepositoryMocked.find.mockResolvedValueOnce([provisionMocked, { ...provisionMocked, id: 'other-id', totalAmount: 10000 }])
                managerMocked.findOne.mockResolvedValueOnce({ id: 'primary-id' })
                queryBuilderMocked.getRawMany.mockResolvedValueOnce([{ provisionId: 'provision-id', reservedAmount: '17502' }, { provisionId: 'other-id', reservedAmount: '-2000' }])

                const response = await provisionService.findAll('user-id')

                expect(response.map(({ id, reservedAmount, progressPct }) => [id, reservedAmount, progressPct])).toEqual([['provision-id', 17502, 25], ['other-id', -2000, 0]])
                expect(managerMocked.findOne).toHaveBeenCalledWith(Account, { select: { id: true }, where: { userId: 'user-id', isPrimary: true } })
                expect(managerMocked.createQueryBuilder).toHaveBeenCalledWith(Transaction, 'transaction')
                expect(queryBuilderMocked.innerJoin).toHaveBeenCalledWith(Provision, 'provision', 'provision.id = transaction.provisionId AND provision.accountId = transaction.accountId')
                expect(queryBuilderMocked.andWhere).toHaveBeenCalledWith('transaction.provisionId IN (:...provisionIds)', { provisionIds: ['provision-id', 'other-id'] })
                expect(queryBuilderMocked.andWhere).toHaveBeenCalledWith('transaction.status = :status', { status: TransactionStatus.CONFIRMED })
            })

            it('should return null for a provision on the primary account or without account', async () => {
                provisionRepositoryMocked.find.mockResolvedValueOnce([{ ...provisionMocked, accountId: 'primary-id' }, { ...provisionMocked, id: 'other-id', accountId: null }])
                managerMocked.findOne.mockResolvedValueOnce({ id: 'primary-id' })

                const response = await provisionService.findAll('user-id')

                expect(response.map(({ reservedAmount, progressPct }) => [reservedAmount, progressPct])).toEqual([[null, null], [null, null]])
                expect(managerMocked.createQueryBuilder).not.toHaveBeenCalled()
            })
        })
    })

    describe('create', () => {
        describe('Success cases', () => {
            it('should save an active provision for the user', async () => {
                const body = { label: 'Assurance auto', totalAmount: 70000, frequencyMonths: 12, nextDueDate: '2027-03-15', startedAt: '2026-11-01' }
                provisionRepositoryMocked.save.mockResolvedValueOnce({ ...provisionMocked, accountId: null })

                const response = await provisionService.create('user-id', body)

                expect(response).toStrictEqual({ ...provisionDto, accountId: null, reservedAmount: null, progressPct: null })
                expect(managerMocked.createQueryBuilder).not.toHaveBeenCalled()
                expect(provisionRepositoryMocked.save).toHaveBeenCalledWith({ ...body, status: ProvisionStatus.ACTIVE, userId: 'user-id' })
            })
        })
    })

    describe('update', () => {
        describe('Failure cases', () => {
            it('should throw ConflictException when the provision is cancelled', async () => {
                provisionRepositoryMocked.findOne.mockResolvedValueOnce({ ...provisionMocked, status: ProvisionStatus.CANCELLED })

                await expect(provisionService.update('user-id', 'provision-id', { status: ProvisionStatus.ACTIVE })).rejects.toThrow(new ConflictException(ERRORS_MESSAGES.PROVISIONS.PROVISION_CANCELLED))
                expect(provisionRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when provision doesn\'t belong to the user', async () => {
                provisionRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(provisionService.update('user-id', 'provision-id', { label: 'Dentiste' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND))
            })
        })
    })

    describe('remove', () => {
        describe('Success cases', () => {
            it('should delete the provision', async () => {
                provisionRepositoryMocked.findOne.mockResolvedValueOnce(provisionMocked)

                const response = await provisionService.remove('user-id', 'provision-id')

                expect(response.message).toBe(SUCCESS_MESSAGES.PROVISION.PROVISION_DELETED)
                expect(provisionRepositoryMocked.delete).toHaveBeenCalledWith('provision-id')
            })
        })
    })

    describe('settle', () => {
        describe('Success cases', () => {
            it('should lock the provision, create the expense and move the due date forward', async () => {
                managerMocked.findOne.mockResolvedValueOnce(provisionMocked)
                managerMocked.save.mockResolvedValueOnce(transactionMocked)

                const response = await provisionService.settle('user-id', 'provision-id', { occurredOn: '2027-03-14' })

                expect(managerMocked.findOne).toHaveBeenCalledWith(Provision, { where: { id: 'provision-id', userId: 'user-id' }, lock: { mode: 'pessimistic_write' } })
                expect(managerMocked.save).toHaveBeenCalledWith(Transaction, {
                    amount: -70000,
                    occurredOn: '2027-03-14',
                    merchant: 'Assurance auto',
                    accountId: 'account-id',
                    categoryId: null,
                    sourceType: TransactionSourceType.PROVISION,
                    status: TransactionStatus.CONFIRMED,
                    provisionId: 'provision-id',
                    userId: 'user-id',
                })
                expect(managerMocked.update).toHaveBeenCalledWith(Provision, 'provision-id', { nextDueDate: '2028-03-15' })
                expect(managerMocked.exists).not.toHaveBeenCalled()
                expect(response.provision).toStrictEqual({ ...provisionDto, nextDueDate: '2028-03-15' })
                expect(response.transaction).toMatchObject({ id: 'transaction-id', amount: -70000, provisionId: 'provision-id' })
            })

            it('should use the amount and the account sent after checking the account', async () => {
                managerMocked.findOne.mockResolvedValueOnce(provisionMocked)
                managerMocked.exists.mockResolvedValueOnce(true)
                managerMocked.save.mockResolvedValueOnce(transactionMocked)

                await provisionService.settle('user-id', 'provision-id', { occurredOn: '2027-03-14', amount: 72000, accountId: 'other-account-id' })

                expect(managerMocked.exists).toHaveBeenCalledWith(Account, { where: { id: 'other-account-id', userId: 'user-id' } })
                expect(managerMocked.save).toHaveBeenCalledWith(Transaction, expect.objectContaining({ amount: -72000, accountId: 'other-account-id' }))
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when provision doesn\'t belong to the user', async () => {
                managerMocked.findOne.mockResolvedValueOnce(null)

                await expect(provisionService.settle('user-id', 'provision-id', { occurredOn: '2027-03-14' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should throw ConflictException when the provision is cancelled', async () => {
                managerMocked.findOne.mockResolvedValueOnce({ ...provisionMocked, status: ProvisionStatus.CANCELLED })

                await expect(provisionService.settle('user-id', 'provision-id', { occurredOn: '2027-03-14' })).rejects.toThrow(new ConflictException(ERRORS_MESSAGES.PROVISIONS.PROVISION_CANCELLED))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should throw BadRequestException when no account is available', async () => {
                managerMocked.findOne.mockResolvedValueOnce({ ...provisionMocked, accountId: null })

                await expect(provisionService.settle('user-id', 'provision-id', { occurredOn: '2027-03-14' })).rejects.toThrow(new BadRequestException(ERRORS_MESSAGES.PROVISIONS.ACCOUNT_REQUIRED))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when the account sent doesn\'t belong to the user', async () => {
                managerMocked.findOne.mockResolvedValueOnce(provisionMocked)
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(provisionService.settle('user-id', 'provision-id', { occurredOn: '2027-03-14', accountId: 'other-account-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it('should not move the due date when the expense cannot be saved', async () => {
                managerMocked.findOne.mockResolvedValueOnce(provisionMocked)
                managerMocked.save.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(provisionService.settle('user-id', 'provision-id', { occurredOn: '2027-03-14' })).rejects.toThrow(new Error('An error has occured'))
                expect(managerMocked.update).not.toHaveBeenCalled()
            })
        })
    })

    describe('findSettlements', () => {
        describe('Success cases', () => {
            it('should return the transactions of the provision, most recent first', async () => {
                provisionRepositoryMocked.findOne.mockResolvedValueOnce(provisionMocked)
                transactionRepositoryMocked.find.mockResolvedValueOnce([transactionMocked])

                const response = await provisionService.findSettlements('user-id', 'provision-id')

                expect(response).toHaveLength(1)
                expect(response[0]).toMatchObject({ id: 'transaction-id', provisionId: 'provision-id' })
                expect(transactionRepositoryMocked.find).toHaveBeenCalledWith({ where: { provisionId: 'provision-id', userId: 'user-id', sourceType: TransactionSourceType.PROVISION }, order: { occurredOn: 'DESC', createdAt: 'DESC' } })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when provision doesn\'t belong to the user', async () => {
                provisionRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(provisionService.findSettlements('user-id', 'provision-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND))
                expect(transactionRepositoryMocked.find).not.toHaveBeenCalled()
            })
        })
    })
})
