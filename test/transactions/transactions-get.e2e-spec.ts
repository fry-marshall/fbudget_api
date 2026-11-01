import { ERRORS_MESSAGES } from "src/common/constants";
import { CategoryType } from "src/modules/categories/types";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET transactions', () => {
    let ctx: TestContext;

    beforeAll(async () => {
        ctx = await createTestApp()
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should return an empty list when user has no transaction in the month', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            await createTransaction(ctx, user, account, { occurredOn: '2026-09-15' })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-10')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the transactions of the month with all fields, most recent first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const groceries = await createTransaction(ctx, user, account, { occurredOn: '2026-10-02', categoryId: category.id, merchant: 'Carrefour Express', note: 'Courses', tags: ['maison'] })
            const salary = await createTransaction(ctx, user, account, { amount: 248000, occurredOn: '2026-10-28' })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-10')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual([
                {
                    id: salary.id,
                    amount: 248000,
                    occurredOn: '2026-10-28',
                    accountId: account.id,
                    categoryId: null,
                    merchant: null,
                    note: null,
                    tags: [],
                    sourceType: TransactionSourceType.MANUAL,
                    provisionId: null,
                    installmentId: null,
                    savingsGoalId: null,
                    transferId: null,
                    createdAt: salary.createdAt!.toISOString(),
                },
                {
                    id: groceries.id,
                    amount: -4250,
                    occurredOn: '2026-10-02',
                    accountId: account.id,
                    categoryId: category.id,
                    merchant: 'Carrefour Express',
                    note: 'Courses',
                    tags: ['maison'],
                    sourceType: TransactionSourceType.MANUAL,
                    provisionId: null,
                    installmentId: null,
                    savingsGoalId: null,
                    transferId: null,
                    createdAt: groceries.createdAt!.toISOString(),
                },
            ])
        })

        it('should order the transactions of the same day by creation date, most recent first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const first = await createTransaction(ctx, user, account)
            const second = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-10')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((transaction) => transaction.id)).toEqual([second.id, first.id])
        })

        it('should include the first and the last day of the month and exclude the other months', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            await createTransaction(ctx, user, account, { occurredOn: '2026-01-31' })
            const firstDay = await createTransaction(ctx, user, account, { occurredOn: '2026-02-01' })
            const lastDay = await createTransaction(ctx, user, account, { occurredOn: '2026-02-28' })
            await createTransaction(ctx, user, account, { occurredOn: '2026-03-01' })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-02')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((transaction) => transaction.id)).toEqual([lastDay.id, firstDay.id])
        })

        it('should handle december up to the 31st', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const lastDay = await createTransaction(ctx, user, account, { occurredOn: '2026-12-31' })
            await createTransaction(ctx, user, account, { occurredOn: '2027-01-01' })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-12')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((transaction) => transaction.id)).toEqual([lastDay.id])
        })

        it('should filter by account, by category and by both', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const card = await createAccount(ctx, user)
            const wave = await createAccount(ctx, user, { name: 'Wave' })
            const groceries = await createCategory(ctx, user)
            const health = await createCategory(ctx, user, { type: CategoryType.HEALTH })
            const cardGroceries = await createTransaction(ctx, user, card, { categoryId: groceries.id })
            const cardHealth = await createTransaction(ctx, user, card, { categoryId: health.id })
            const waveGroceries = await createTransaction(ctx, user, wave, { categoryId: groceries.id })

            const get = async (query: string) => (await request(ctx.app.getHttpServer())
                .get(`/api/v1/transactions?month=2026-10${query}`)
                .set('Authorization', `Bearer ${accessToken}`)).body.data.map((transaction) => transaction.id).sort()

            expect(await get(`&accountId=${card.id}`)).toEqual([cardGroceries.id, cardHealth.id].sort())
            expect(await get(`&categoryId=${groceries.id}`)).toEqual([cardGroceries.id, waveGroceries.id].sort())
            expect(await get(`&accountId=${card.id}&categoryId=${groceries.id}`)).toEqual([cardGroceries.id])
            expect(await get(`&accountId=${wave.id}&categoryId=${health.id}`)).toEqual([])
        })

        it('should not return the transactions of other users, even when filtering on their account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const account = await createAccount(ctx, user)
            const otherAccount = await createAccount(ctx, otherUser)
            const transaction = await createTransaction(ctx, user, account)
            await createTransaction(ctx, otherUser, otherAccount)

            const all = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-10')
                .set('Authorization', `Bearer ${accessToken}`)
            const filtered = await request(ctx.app.getHttpServer())
                .get(`/api/v1/transactions?month=2026-10&accountId=${otherAccount.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(all.body.data.map((transaction) => transaction.id)).toEqual([transaction.id])
            expect(filtered.statusCode).toBe(200)
            expect(filtered.body.data).toEqual([])
        })

        it('should not expose the user relation', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-10')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data[0].userId).toBeUndefined()
            expect(response.body.data[0].user).toBeUndefined()
            expect(response.body.data[0].updatedAt).toBeUndefined()
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['month is missing', ''],
            ['month is 2026-13', '?month=2026-13'],
            ['month is 2026-00', '?month=2026-00'],
            ['month is 2026-1', '?month=2026-1'],
            ['month is a full date', '?month=2026-10-01'],
            ['month is sent twice', '?month=2026-10&month=2026-11'],
            ['accountId is not a uuid', '?month=2026-10&accountId=toto'],
            ['categoryId is not a uuid', '?month=2026-10&categoryId=toto'],
            ['an unknown filter is sent', '?month=2026-10&userId=00000000-0000-0000-0000-000000000000'],
        ])('should throw bad request when %s', async (_, query) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/transactions${query}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-10')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-10')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-10')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/transactions?month=2026-10')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
