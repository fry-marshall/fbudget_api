import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DataSource, In, QueryFailedError } from "typeorm";
import { ERRORS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { TransferService } from "./transfer.service";

describe('TransferService', () => {

    let managerMocked = {
        count: jest.fn(),
        save: jest.fn(),
    };
    let dataSourceMocked = {
        transaction: jest.fn(),
    };
    let transferService: TransferService;

    const createdAt = new Date()
    const body = { fromAccountId: 'account-id', toAccountId: 'provisions-account-id', amount: 5834, occurredOn: '2026-11-01' }

    const foreignKeyError = (detail: string) => new QueryFailedError('INSERT', [], Object.assign(new Error('query failed'), { code: '23503', detail }))

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                TransferService,
                { provide: DataSource, useValue: dataSourceMocked },
            ]
        }).compile()

        transferService = moduleRef.get(TransferService)
    })

    beforeEach(() => {
        jest.resetAllMocks()
        dataSourceMocked.transaction.mockImplementation((callback) => callback(managerMocked))
        managerMocked.save.mockImplementation((_, legs: Transaction[]) => Promise.resolve(legs.map((leg, index) => ({ ...leg, id: `transaction-${index}`, createdAt }))))
    })

    describe('create', () => {
        describe('Success cases', () => {
            it('should save the debit and the credit with the same transferId', async () => {
                managerMocked.count.mockResolvedValueOnce(2)

                const response = await transferService.create('user-id', { ...body, note: 'Provisions' })

                const [, legs] = managerMocked.save.mock.calls[0]
                expect(managerMocked.count).toHaveBeenCalledWith(Account, { where: { id: In(['account-id', 'provisions-account-id']), userId: 'user-id' } })
                expect(legs).toEqual([
                    { amount: -5834, accountId: 'account-id', occurredOn: '2026-11-01', note: 'Provisions', sourceType: TransactionSourceType.TRANSFER, status: TransactionStatus.CONFIRMED, transferId: response.transferId, userId: 'user-id' },
                    { amount: 5834, accountId: 'provisions-account-id', occurredOn: '2026-11-01', note: 'Provisions', sourceType: TransactionSourceType.TRANSFER, status: TransactionStatus.CONFIRMED, transferId: response.transferId, userId: 'user-id' },
                ])
                expect(response.from).toMatchObject({ id: 'transaction-0', amount: -5834, transferId: response.transferId })
                expect(response.to).toMatchObject({ id: 'transaction-1', amount: 5834, transferId: response.transferId })
            })

            it('should generate a different transferId for each transfer', async () => {
                managerMocked.count.mockResolvedValue(2)

                const first = await transferService.create('user-id', body)
                const second = await transferService.create('user-id', body)

                expect(first.transferId).not.toBe(second.transferId)
            })
        })

        describe('Failure cases', () => {
            it('should throw BadRequestException when the source and destination accounts are the same', async () => {
                await expect(transferService.create('user-id', { ...body, toAccountId: 'account-id' })).rejects.toThrow(new BadRequestException(ERRORS_MESSAGES.TRANSFERS.SAME_ACCOUNT))
                expect(dataSourceMocked.transaction).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when an account does not belong to the user', async () => {
                managerMocked.count.mockResolvedValueOnce(1)

                await expect(transferService.create('user-id', body)).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(managerMocked.save).not.toHaveBeenCalled()
            })

            it.each([
                ['an account', 'Key (accountId)=(account-id) is not present in table "accounts".', ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND],
                ['the user', 'Key (userId)=(user-id) is not present in table "users".', ERRORS_MESSAGES.AUTH.USER_NOT_FOUND],
            ])('should throw NotFoundException when %s is deleted before saving', async (_, detail, message) => {
                managerMocked.count.mockResolvedValueOnce(2)
                managerMocked.save.mockRejectedValueOnce(foreignKeyError(detail))

                await expect(transferService.create('user-id', body)).rejects.toThrow(new NotFoundException(message))
            })

            it('should throw Error when save fails', async () => {
                managerMocked.count.mockResolvedValueOnce(2)
                managerMocked.save.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(transferService.create('user-id', body)).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })
})
