import { ERRORS_MESSAGES } from "src/common/constants";
import { Category } from "src/modules/categories/category.entity";
import { CategoryType } from "src/modules/categories/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createCategory, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT categories/:id', () => {
    let ctx: TestContext;
    let categoryRepository: Repository<Category>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const CATEGORY_DEFAULTS = { type: CategoryType.GROCERIES, label: null, envelopeBudget: null }

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
        it('should update the label and the envelope budget and return the category', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Supermarché', envelopeBudget: 14000 })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                id: category.id,
                type: CategoryType.GROCERIES,
                label: 'Supermarché',
                envelopeBudget: 14000,
                createdAt: category.createdAt!.toISOString(),
            })
            expect(await categoryRepository.findOneBy({ id: category.id })).toMatchObject({ label: 'Supermarché', envelopeBudget: 14000 })
        })

        it.each([
            ['label', 'Supermarché'],
            ['envelopeBudget', 0],
            ['envelopeBudget', 2147483647],
        ])('should only update %s to %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...CATEGORY_DEFAULTS, [field]: value })
            expect(await categoryRepository.findOneBy({ id: category.id })).toMatchObject({ ...CATEGORY_DEFAULTS, [field]: value })
        })

        it('should rename a category of type other', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user, { type: CategoryType.OTHER, label: 'Netflix' })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Streaming' })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ type: CategoryType.OTHER, label: 'Streaming' })
        })

        it('should leave the category unchanged when body is empty', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user, { envelopeBudget: 14000 })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...CATEGORY_DEFAULTS, envelopeBudget: 14000 })
        })

        it('should not update the other categories', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)
            const otherCategory = await createCategory(ctx, user, { type: CategoryType.HEALTH })

            await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Supermarché' })

            expect(await categoryRepository.findOneBy({ id: otherCategory.id })).toMatchObject({ type: CategoryType.HEALTH, label: null })
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['label', ''],
            ['label', 123],
            ['label', null],
            ['envelopeBudget', -1],
            ['envelopeBudget', 15.5],
            ['envelopeBudget', '14000'],
            ['envelopeBudget', 2147483648],
            ['envelopeBudget', null],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await categoryRepository.findOneBy({ id: category.id })).toMatchObject(CATEGORY_DEFAULTS)
        })

        it.each([
            ['type', CategoryType.HEALTH],
            ['userId', '00000000-0000-0000-0000-000000000000'],
            ['id', '00000000-0000-0000-0000-000000000000'],
        ])('should throw bad request when %s is sent', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Supermarché', [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await categoryRepository.findOneBy({ id: category.id })).toMatchObject({ ...CATEGORY_DEFAULTS, userId: user.id })
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/categories/toto')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Supermarché' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when category does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Supermarché' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
        })

        it('should throw not found and keep the category when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherCategory = await createCategory(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${otherCategory.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Supermarché' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
            expect(await categoryRepository.findOneBy({ id: otherCategory.id })).toMatchObject(CATEGORY_DEFAULTS)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${category.id}`)
                .send({ label: 'Supermarché' })

            expect(response.statusCode).toBe(401)
            expect(await categoryRepository.findOneBy({ id: category.id })).toMatchObject(CATEGORY_DEFAULTS)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')
                .send({ label: 'Supermarché' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send({ label: 'Supermarché' })

            expect(response.statusCode).toBe(401)
            expect(await categoryRepository.findOneBy({ id: category.id })).toMatchObject(CATEGORY_DEFAULTS)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/categories/${category.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send({ label: 'Supermarché' })

            expect(response.statusCode).toBe(401)
            expect(await categoryRepository.findOneBy({ id: category.id })).toMatchObject(CATEGORY_DEFAULTS)
        })
    })
})
