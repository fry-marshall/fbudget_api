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

describe('POST transactions/confirm', () => {
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

    const createPending = (user: User, account: Account, occurredOn = '2026-11-05') => createTransaction(ctx, user, account, { amount: -85000, occurredOn, status: TransactionStatus.PENDING, sourceType: TransactionSourceType.FIXED_CHARGE })

    const confirmAll = (accessToken: string, body: object) => request(ctx.app.getHttpServer())
        .post('/api/v1/transactions/confirm')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)

    const countPending = (user: User): Promise<number> => transactionRepository.countBy({ userId: user.id, status: TransactionStatus.PENDING })

    describe('Success cases', () => {
        it('should confirm the transactions with their planned amount and day and return them, oldest first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const rent = await createPending(user, account, '2026-11-05')
            const salary = await createTransaction(ctx, user, account, { amount: 248000, occurredOn: '2026-10-28', status: TransactionStatus.PENDING, sourceType: TransactionSourceType.INCOME })

            const response = await confirmAll(accessToken, { ids: [rent.id, salary.id] })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.map(({ id, amount, occurredOn, status }: Transaction) => [id, amount, occurredOn, status])).toEqual([
                [salary.id, 248000, '2026-10-28', TransactionStatus.CONFIRMED],
                [rent.id, -85000, '2026-11-05', TransactionStatus.CONFIRMED],
            ])
            expect(response.body.data[0]).toStrictEqual({
                id: salary.id,
                amount: 248000,
                occurredOn: '2026-10-28',
                accountId: account.id,
                categoryId: null,
                merchant: null,
                note: null,
                tags: [],
                sourceType: TransactionSourceType.INCOME,
                status: TransactionStatus.CONFIRMED,
                provisionId: null,
                installmentId: null,
                savingsGoalId: null,
                transferId: null,
                fixedChargeId: null,
                incomeId: null,
                createdAt: salary.createdAt!.toISOString(),
            })
            expect(await countPending(user)).toBe(0)
        })

        it('should confirm the other transaction of a transfer', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { isPrimary: true })
            const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions' })
            const { transferId, from, to } = await createTransfer(ctx, user, account, provisionsAccount)
            await transactionRepository.update({ transferId }, { status: TransactionStatus.PENDING })

            const response = await confirmAll(accessToken, { ids: [to.id] })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.map(({ id }: Transaction) => id)).toEqual([from.id, to.id])
            expect(await countPending(user)).toBe(0)
        })

        it('should ignore the confirmed transactions and only return the newly confirmed ones', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const pending = await createPending(user, account)
            const confirmed = await createTransaction(ctx, user, account)

            const response = await confirmAll(accessToken, { ids: [pending.id, confirmed.id] })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.map(({ id }: Transaction) => id)).toEqual([pending.id])
            expect(await transactionRepository.findOneBy({ id: confirmed.id })).toMatchObject({ status: TransactionStatus.CONFIRMED, amount: -4250 })
        })

        it('should return an empty list when called again', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const pending = await createPending(user, await createAccount(ctx, user))
            await confirmAll(accessToken, { ids: [pending.id] })

            const response = await confirmAll(accessToken, { ids: [pending.id] })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should not confirm the other pending transactions', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const pending = await createPending(user, account)
            const otherPending = await createPending(user, account)

            await confirmAll(accessToken, { ids: [pending.id] })

            expect(await transactionRepository.findOneBy({ id: otherPending.id })).toMatchObject({ status: TransactionStatus.PENDING })
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['ids is missing', {}],
            ['ids is empty', { ids: [] }],
            ['ids is not an array', { ids: UNKNOWN_ID }],
            ['an id is not a uuid', { ids: ['toto'] }],
            ['an id is sent twice', { ids: [UNKNOWN_ID, UNKNOWN_ID] }],
            ['more than 200 ids are sent', { ids: Array.from({ length: 201 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`) }],
            ['an unknown field is sent', { ids: [UNKNOWN_ID], amount: 1000 }],
        ])('should throw bad request when %s', async (_, body) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await confirmAll(accessToken, body)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found and confirm nothing when a transaction does not exist', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const pending = await createPending(user, await createAccount(ctx, user))

            const response = await confirmAll(accessToken, { ids: [pending.id, UNKNOWN_ID] })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
            expect(await countPending(user)).toBe(1)
        })

        it('should throw not found and confirm nothing when a transaction belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const pending = await createPending(user, await createAccount(ctx, user))
            const otherPending = await createPending(otherUser, await createAccount(ctx, otherUser))

            const response = await confirmAll(accessToken, { ids: [pending.id, otherPending.id] })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
            expect(await countPending(user)).toBe(1)
            expect(await countPending(otherUser)).toBe(1)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const pending = await createPending(user, await createAccount(ctx, user))

            const response = await request(ctx.app.getHttpServer()).post('/api/v1/transactions/confirm').send({ ids: [pending.id] })

            expect(response.statusCode).toBe(401)
            expect(await countPending(user)).toBe(1)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await confirmAll('toto', { ids: [UNKNOWN_ID] })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const pending = await createPending(user, await createAccount(ctx, user))

            const response = await confirmAll(signAccessToken(ctx, user, -10), { ids: [pending.id] })

            expect(response.statusCode).toBe(401)
            expect(await countPending(user)).toBe(1)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const pending = await createPending(user, await createAccount(ctx, user))

            const response = await confirmAll(refreshToken, { ids: [pending.id] })

            expect(response.statusCode).toBe(401)
            expect(await countPending(user)).toBe(1)
        })
    })
})
