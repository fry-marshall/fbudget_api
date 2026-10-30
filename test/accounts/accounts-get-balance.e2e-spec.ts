import { ERRORS_MESSAGES } from "src/common/constants";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET accounts/:id/balance', () => {
    let ctx: TestContext;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

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
        it('should return the initial balance when the account has no transaction', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${account.id}/balance`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({ accountId: account.id, initialBalance: 150000, balance: 150000 })
        })

        it('should add the signed amounts of all the account transactions, whatever their month', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            await createTransaction(ctx, user, account, { amount: -4250, occurredOn: '2026-09-15' })
            await createTransaction(ctx, user, account, { amount: -50000 })
            await createTransaction(ctx, user, account, { amount: 248000, occurredOn: '2026-11-28' })

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${account.id}/balance`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.balance).toBe(150000 - 4250 - 50000 + 248000)
        })

        it('should return a negative balance', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { initialBalance: 1000 })
            await createTransaction(ctx, user, account, { amount: -4250 })

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${account.id}/balance`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.balance).toBe(-3250)
        })

        it('should not count the transactions of the other accounts', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const otherAccount = await createAccount(ctx, user, { name: 'Wave' })
            await createTransaction(ctx, user, otherAccount, { amount: -50000 })

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${account.id}/balance`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.balance).toBe(150000)
        })

        it('should exceed the int range without overflowing', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { initialBalance: 2147483647 })
            await createTransaction(ctx, user, account, { amount: 2147483647 })
            await createTransaction(ctx, user, account, { amount: 2147483647 })

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${account.id}/balance`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.balance).toBe(3 * 2147483647)
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/accounts/toto/balance')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when account does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${UNKNOWN_ID}/balance`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        })

        it('should throw not found when account belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${otherAccount.id}/balance`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${UNKNOWN_ID}/balance`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${UNKNOWN_ID}/balance`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${account.id}/balance`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${account.id}/balance`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
