import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createFixedCharge, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET fixed-charges', () => {
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
        it('should return an empty list when user has no fixed charge', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/fixed-charges')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the user fixed charges with all fields, oldest first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const rent = await createFixedCharge(ctx, user, { accountId: account.id, categoryId: category.id })
            const netflix = await createFixedCharge(ctx, user, { label: 'Netflix', amount: 1399, dayOfMonth: 31 })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/fixed-charges')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual([
                {
                    id: rent.id,
                    label: 'Loyer',
                    amount: 85000,
                    dayOfMonth: 5,
                    accountId: account.id,
                    categoryId: category.id,
                    createdAt: rent.createdAt!.toISOString(),
                },
                {
                    id: netflix.id,
                    label: 'Netflix',
                    amount: 1399,
                    dayOfMonth: 31,
                    accountId: null,
                    categoryId: null,
                    createdAt: netflix.createdAt!.toISOString(),
                },
            ])
        })

        it('should not return the fixed charges of other users', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const fixedCharge = await createFixedCharge(ctx, user)
            await createFixedCharge(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/fixed-charges')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toHaveLength(1)
            expect(response.body.data[0].id).toBe(fixedCharge.id)
        })

        it('should not expose the user relation', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/fixed-charges')
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
                .get('/api/v1/fixed-charges')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/fixed-charges')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/fixed-charges')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/fixed-charges')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
