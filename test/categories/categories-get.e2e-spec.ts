import { CategoryType } from "src/modules/categories/types";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createCategory, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET categories', () => {
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
        it('should return an empty list when user has no category', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the user categories with all fields, oldest first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const groceries = await createCategory(ctx, user, { envelopeBudget: 14000 })
            const netflix = await createCategory(ctx, user, { type: CategoryType.OTHER, label: 'Netflix' })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual([
                {
                    id: groceries.id,
                    type: CategoryType.GROCERIES,
                    label: null,
                    envelopeBudget: 14000,
                    createdAt: groceries.createdAt!.toISOString(),
                },
                {
                    id: netflix.id,
                    type: CategoryType.OTHER,
                    label: 'Netflix',
                    envelopeBudget: null,
                    createdAt: netflix.createdAt!.toISOString(),
                },
            ])
        })

        it('should not return the categories of other users', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const category = await createCategory(ctx, user)
            await createCategory(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toHaveLength(1)
            expect(response.body.data[0].id).toBe(category.id)
        })

        it('should not expose the user relation', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/categories')
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
                .get('/api/v1/categories')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/categories')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/categories')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/categories')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
