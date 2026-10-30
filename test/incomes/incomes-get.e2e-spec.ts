import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createIncome, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET incomes', () => {
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
        it('should return an empty list when user has no income', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the user incomes with all fields, oldest first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const salary = await createIncome(ctx, user, { dayOfMonth: 28, accountId: account.id })
            const freelance = await createIncome(ctx, user, { label: 'Freelance', amount: 50000, isVariable: true })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual([
                {
                    id: salary.id,
                    label: 'Salaire',
                    amount: 248000,
                    dayOfMonth: 28,
                    isVariable: false,
                    accountId: account.id,
                    createdAt: salary.createdAt!.toISOString(),
                },
                {
                    id: freelance.id,
                    label: 'Freelance',
                    amount: 50000,
                    dayOfMonth: null,
                    isVariable: true,
                    accountId: null,
                    createdAt: freelance.createdAt!.toISOString(),
                },
            ])
        })

        it('should not return the incomes of other users', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const income = await createIncome(ctx, user)
            await createIncome(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toHaveLength(1)
            expect(response.body.data[0].id).toBe(income.id)
        })

        it('should not expose the user relation', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createIncome(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data[0].userId).toBeUndefined()
            expect(response.body.data[0].user).toBeUndefined()
            expect(response.body.data[0].updatedAt).toBeUndefined()
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/incomes')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/incomes')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/incomes')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/incomes')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
