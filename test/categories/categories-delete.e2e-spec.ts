import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Category } from "src/modules/categories/category.entity";
import { CategoryType } from "src/modules/categories/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createCategory, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('DELETE categories/:id', () => {
    let ctx: TestContext;
    let categoryRepository: Repository<Category>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

    beforeAll(async () => {
        ctx = await createTestApp()
        categoryRepository = ctx.repo(Category)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should delete the category and keep the other ones', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)
            const otherCategory = await createCategory(ctx, user, { type: CategoryType.HEALTH })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.message).toBe(SUCCESS_MESSAGES.CATEGORY.CATEGORY_DELETED)
            expect(await categoryRepository.findOneBy({ id: category.id })).toBeNull()
            expect(await categoryRepository.findOneBy({ id: otherCategory.id })).not.toBeNull()
        })

        it('should allow to create again a category of the deleted type', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)

            await request(ctx.app.getHttpServer())
                .delete(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ type: CategoryType.GROCERIES })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.id).not.toBe(category.id)
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/categories/toto')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when category does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/categories/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
        })

        it('should throw not found when category is already deleted', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)

            const firstResponse = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
            const secondResponse = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(firstResponse.statusCode).toBe(200)
            expect(secondResponse.statusCode).toBe(404)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
        })

        it('should throw not found and keep the category when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherCategory = await createCategory(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/categories/${otherCategory.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
            expect(await categoryRepository.findOneBy({ id: otherCategory.id })).not.toBeNull()
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/categories/${category.id}`)

            expect(response.statusCode).toBe(401)
            expect(await categoryRepository.findOneBy({ id: category.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/categories/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await categoryRepository.findOneBy({ id: category.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await categoryRepository.findOneBy({ id: category.id })).not.toBeNull()
        })
    })
})
