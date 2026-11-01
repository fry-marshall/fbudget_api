import { ERRORS_MESSAGES } from "src/common/constants";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST transfers', () => {
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

    const setup = async () => {
        const { user, accessToken } = await createUserAndLogin(ctx)
        const account = await createAccount(ctx, user, { isPrimary: true, initialBalance: 248000 })
        const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions', initialBalance: 0 })
        const validBody = { fromAccountId: account.id, toAccountId: provisionsAccount.id, amount: 5834, occurredOn: '2026-11-01' }

        return { user, accessToken, account, provisionsAccount, validBody }
    }

    const getBalance = async (accessToken: string, accountId: string): Promise<number> => (await request(ctx.app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}/balance`)
        .set('Authorization', `Bearer ${accessToken}`)).body.data.balance

    describe('Success cases', () => {
        it('should debit the source account and credit the destination account with the same transferId', async () => {
            const { accessToken, account, provisionsAccount, validBody } = await setup()

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...validBody, note: 'Provisions de novembre' })

            const [from, to] = await Promise.all([
                transactionRepository.findOneBy({ accountId: account.id }),
                transactionRepository.findOneBy({ accountId: provisionsAccount.id }),
            ])
            const leg = { occurredOn: '2026-11-01', categoryId: null, merchant: null, note: 'Provisions de novembre', tags: [], sourceType: TransactionSourceType.TRANSFER, provisionId: null, installmentId: null, savingsGoalId: null, transferId: response.body.data.transferId }
            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({
                transferId: expect.stringMatching(/^[0-9a-f-]{36}$/),
                from: { id: from!.id, amount: -5834, accountId: account.id, ...leg, createdAt: from!.createdAt!.toISOString() },
                to: { id: to!.id, amount: 5834, accountId: provisionsAccount.id, ...leg, createdAt: to!.createdAt!.toISOString() },
            })
            expect(await transactionRepository.count()).toEqual(2)
        })

        it('should move the money between the two balances and keep their sum', async () => {
            const { accessToken, account, provisionsAccount, validBody } = await setup()

            await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(validBody)

            expect(await getBalance(accessToken, account.id!)).toBe(242166)
            expect(await getBalance(accessToken, provisionsAccount.id!)).toBe(5834)
        })

        it('should list both transactions of the transfer in the transactions of the month', async () => {
            const { accessToken, validBody } = await setup()

            const transfer = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(validBody)
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-11')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((transaction) => transaction.id).sort()).toEqual([transfer.body.data.from.id, transfer.body.data.to.id].sort())
            expect(response.body.data.every((transaction) => transaction.transferId === transfer.body.data.transferId)).toBe(true)
        })

        it.each([
            ['amount', 1],
            ['amount', 2147483647],
            ['occurredOn', '2020-01-01'],
            ['note', null],
        ])('should accept %s %p', async (field, value) => {
            const { accessToken, validBody } = await setup()

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...validBody, [field]: value })

            expect(response.statusCode).toBe(201)
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['fromAccountId', undefined],
            ['fromAccountId', null],
            ['fromAccountId', 'toto'],
            ['toAccountId', undefined],
            ['toAccountId', null],
            ['toAccountId', 'toto'],
            ['amount', undefined],
            ['amount', null],
            ['amount', 0],
            ['amount', -5834],
            ['amount', 58.34],
            ['amount', '5834'],
            ['amount', 2147483648],
            ['occurredOn', undefined],
            ['occurredOn', null],
            ['occurredOn', '2026-02-30'],
            ['occurredOn', '2026-11-01T10:00:00Z'],
            ['note', ''],
            ['note', 123],
            ['categoryId', UNKNOWN_ID],
            ['merchant', 'Banque'],
            ['sourceType', TransactionSourceType.MANUAL],
            ['transferId', UNKNOWN_ID],
            ['userId', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { accessToken, validBody } = await setup()

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...validBody, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw bad request when the source and destination accounts are the same', async () => {
            const { accessToken, account, validBody } = await setup()

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...validBody, toAccountId: account.id })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSFERS.SAME_ACCOUNT)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it.each([
            ['source account does not exist', 'fromAccountId'],
            ['destination account does not exist', 'toAccountId'],
        ])('should throw not found and create nothing when %s', async (_, field) => {
            const { accessToken, validBody } = await setup()

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...validBody, [field]: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it.each([
            ['source', 'fromAccountId'],
            ['destination', 'toAccountId'],
        ])('should throw not found and create nothing when the %s account belongs to another user', async (_, field) => {
            const { accessToken, validBody } = await setup()
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...validBody, [field]: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken, validBody } = await setup()
            await ctx.repo(User).delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(validBody)

            expect(response.statusCode).toBe(404)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { validBody } = await setup()

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .send(validBody)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const { validBody } = await setup()

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', 'Bearer toto')
                .send(validBody)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user, validBody } = await setup()
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(validBody)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { validBody } = await setup()
            const { refreshToken } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transfers')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(validBody)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })
    })
})
