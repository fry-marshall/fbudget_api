import { ERRORS_MESSAGES } from "src/common/constants";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "src/modules/transactions/types";
import { User } from "src/modules/users/user.entity";
import { Account } from "src/modules/accounts/account.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createTransaction, createTransfer, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT transactions/:id/confirm', () => {
    let ctx: TestContext;
    let transactionRepository: Repository<Transaction>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

    beforeAll(async () => {
        ctx = await createTestApp()
        transactionRepository = ctx.repo(Transaction)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    const createPending = (user: User, account: Account) => createTransaction(ctx, user, account, { amount: -85000, occurredOn: '2026-11-05', status: TransactionStatus.PENDING, sourceType: TransactionSourceType.FIXED_CHARGE, merchant: 'Loyer' })

    const createPendingTransfer = async (user: User, from: Account, to: Account) => {
        const transfer = await createTransfer(ctx, user, from, to)
        await transactionRepository.update({ transferId: transfer.transferId }, { status: TransactionStatus.PENDING })

        return transfer
    }

    const confirm = (accessToken: string, id: string, body: object = {}) => request(ctx.app.getHttpServer())
        .put(`/api/v1/transactions/${id}/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)

    const getBalance = async (accessToken: string, accountId: string): Promise<number> => (await request(ctx.app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}/balance`)
        .set('Authorization', `Bearer ${accessToken}`)).body.data.balance

    describe('Success cases', () => {
        it('should confirm the transaction with its planned amount and day and count it in the balance', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { initialBalance: 150000 })
            const pending = await createPending(user, account)
            expect(await getBalance(accessToken, account.id!)).toBe(150000)

            const response = await confirm(accessToken, pending.id!)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                id: pending.id,
                amount: -85000,
                occurredOn: '2026-11-05',
                accountId: account.id,
                categoryId: null,
                merchant: 'Loyer',
                note: null,
                tags: [],
                sourceType: TransactionSourceType.FIXED_CHARGE,
                status: TransactionStatus.CONFIRMED,
                provisionId: null,
                installmentId: null,
                savingsGoalId: null,
                transferId: null,
                fixedChargeId: null,
                incomeId: null,
                createdAt: pending.createdAt!.toISOString(),
            })
            expect(await transactionRepository.findOneBy({ id: pending.id })).toMatchObject({ status: TransactionStatus.CONFIRMED, amount: -85000 })
            expect(await getBalance(accessToken, account.id!)).toBe(65000)
        })

        it.each([
            ['an expense', -85000, 87000, -87000],
            ['an income', 248000, 253000, 253000],
        ])('should confirm %s with its actual amount, keeping its sign, and its actual day', async (_, pendingAmount, amount, expected) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const pending = await createTransaction(ctx, user, account, { amount: pendingAmount, occurredOn: '2026-11-28', status: TransactionStatus.PENDING })

            const response = await confirm(accessToken, pending.id!, { amount, occurredOn: '2026-11-27' })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ amount: expected, occurredOn: '2026-11-27', status: TransactionStatus.CONFIRMED })
            expect(await transactionRepository.findOneBy({ id: pending.id })).toMatchObject({ amount: expected, occurredOn: '2026-11-27', status: TransactionStatus.CONFIRMED })
        })

        it('should confirm both transactions of a transfer with the same amount and day from either one', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { isPrimary: true, initialBalance: 248000 })
            const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions', initialBalance: 0 })
            const { from, to } = await createPendingTransfer(user, account, provisionsAccount)

            const response = await confirm(accessToken, to.id!, { amount: 6000, occurredOn: '2026-11-29' })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ id: to.id, amount: 6000, occurredOn: '2026-11-29', status: TransactionStatus.CONFIRMED })
            expect(await transactionRepository.findOneBy({ id: from.id })).toMatchObject({ amount: -6000, occurredOn: '2026-11-29', status: TransactionStatus.CONFIRMED })
            expect(await getBalance(accessToken, account.id!)).toBe(242000)
            expect(await getBalance(accessToken, provisionsAccount.id!)).toBe(6000)
        })

        it('should not confirm the other pending transactions', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const pending = await createPending(user, account)
            const otherPending = await createPending(user, account)

            await confirm(accessToken, pending.id!)

            expect(await transactionRepository.findOneBy({ id: otherPending.id })).toMatchObject({ status: TransactionStatus.PENDING })
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['amount is 0', { amount: 0 }],
            ['amount is negative', { amount: -87000 }],
            ['amount is a decimal', { amount: 870.5 }],
            ['amount is a string', { amount: '87000' }],
            ['amount is too big', { amount: 2147483648 }],
            ['occurredOn is not a date', { occurredOn: 'toto' }],
            ['occurredOn has a time', { occurredOn: '2026-11-05T10:00:00Z' }],
            ['occurredOn does not exist', { occurredOn: '2026-02-30' }],
            ['an unknown field is sent', { status: TransactionStatus.CONFIRMED }],
            ['the account is sent', { accountId: UNKNOWN_ID }],
        ])('should throw bad request and keep the transaction pending when %s', async (_, body) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const pending = await createPending(user, account)

            const response = await confirm(accessToken, pending.id!, body)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await transactionRepository.findOneBy({ id: pending.id })).toMatchObject({ status: TransactionStatus.PENDING, amount: -85000 })
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await confirm(accessToken, 'toto')

            expect(response.statusCode).toBe(400)
        })

        it('should throw not found when transaction does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await confirm(accessToken, UNKNOWN_ID)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
        })

        it('should throw not found and keep the transaction pending when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const pending = await createPending(otherUser, await createAccount(ctx, otherUser))

            const response = await confirm(accessToken, pending.id!)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
            expect(await transactionRepository.findOneBy({ id: pending.id })).toMatchObject({ status: TransactionStatus.PENDING })
        })

        it('should throw conflict and keep the transaction when it is already confirmed', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const transaction = await createTransaction(ctx, user, await createAccount(ctx, user))

            const response = await confirm(accessToken, transaction.id!, { amount: 1 })

            expect(response.statusCode).toBe(409)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_ALREADY_CONFIRMED)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject({ amount: -4250 })
        })

        it('should confirm only once when confirmed twice at the same time', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const pending = await createPending(user, await createAccount(ctx, user))

            const responses = await Promise.all([confirm(accessToken, pending.id!, { amount: 1000 }), confirm(accessToken, pending.id!, { amount: 2000 })])

            expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409])
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const pending = await createPending(user, await createAccount(ctx, user))

            const response = await request(ctx.app.getHttpServer()).put(`/api/v1/transactions/${pending.id}/confirm`).send({})

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.findOneBy({ id: pending.id })).toMatchObject({ status: TransactionStatus.PENDING })
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await confirm('toto', UNKNOWN_ID)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const pending = await createPending(user, await createAccount(ctx, user))

            const response = await confirm(signAccessToken(ctx, user, -10), pending.id!)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.findOneBy({ id: pending.id })).toMatchObject({ status: TransactionStatus.PENDING })
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const pending = await createPending(user, await createAccount(ctx, user))

            const response = await confirm(refreshToken, pending.id!)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.findOneBy({ id: pending.id })).toMatchObject({ status: TransactionStatus.PENDING })
        })
    })
})
