import { ERRORS_MESSAGES } from "src/common/constants";
import { Category } from "src/modules/categories/category.entity";
import { CategoryType } from "src/modules/categories/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createCategory, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST categories', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let categoryRepository: Repository<Category>;

    const VALID_BODY = { type: CategoryType.GROCERIES, label: 'Supermarché', envelopeBudget: 14000 }

    beforeAll(async () => {
        ctx = await createTestApp()
        userRepository = ctx.repo(User)
        categoryRepository = ctx.repo(Category)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should create the category and return it', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            const categoryCreated = await categoryRepository.findOneBy({ userId: user.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({
                id: categoryCreated!.id,
                type: CategoryType.GROCERIES,
                label: 'Supermarché',
                envelopeBudget: 14000,
                createdAt: categoryCreated!.createdAt!.toISOString(),
            })
            expect(categoryCreated).toMatchObject(VALID_BODY)
        })

        it.each(Object.values(CategoryType).filter((type) => type !== CategoryType.OTHER))('should create a %s category with only its type', async (type) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ type })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({ type, label: null, envelopeBudget: null })
        })

        it('should create several categories of type other', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createCategory(ctx, user, { type: CategoryType.OTHER, label: 'Netflix' })

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ type: CategoryType.OTHER, label: 'Sport' })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({ type: CategoryType.OTHER, label: 'Sport' })
            expect(await categoryRepository.countBy({ userId: user.id, type: CategoryType.OTHER })).toEqual(2)
        })

        it('should create a category of a type already used by another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            await createCategory(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ type: CategoryType.GROCERIES })

            expect(response.statusCode).toBe(201)
            expect(await categoryRepository.countBy({ userId: user.id })).toEqual(1)
        })

        it.each([0, 2147483647])('should accept %p as envelopeBudget', async (envelopeBudget) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, envelopeBudget })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.envelopeBudget).toBe(envelopeBudget)
        })
    })

    describe('Failure cases', () => {
        it('should throw conflict when the user already has a category of this type', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ type: CategoryType.GROCERIES, label: 'Supermarché' })

            expect(response.statusCode).toBe(409)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_ALREADY_EXISTS)
            expect(await categoryRepository.countBy({ userId: user.id })).toEqual(1)
        })

        it('should create only one category when creating the same type in parallel', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const responses = await Promise.all(Array.from({ length: 3 }, () => request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ type: CategoryType.GROCERIES })
            ))

            expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409, 409])
            expect(await categoryRepository.countBy({ userId: user.id })).toEqual(1)
        })

        it.each([
            ['type', undefined],
            ['type', 'courses'],
            ['type', 'GROCERIES'],
            ['type', null],
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

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await categoryRepository.countBy({ userId: user.id })).toEqual(0)
        })

        it.each([
            ['without label', { type: CategoryType.OTHER }],
            ['with an empty label', { type: CategoryType.OTHER, label: '' }],
            ['with a null label', { type: CategoryType.OTHER, label: null }],
        ])('should throw bad request when type is other %s', async (_, body) => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await categoryRepository.countBy({ userId: user.id })).toEqual(0)
        })

        it.each([
            ['userId', '00000000-0000-0000-0000-000000000000'],
            ['id', '00000000-0000-0000-0000-000000000000'],
            ['key', 'groceries'],
            ['isDefault', true],
        ])('should throw bad request when %s is sent', async (field, value) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await categoryRepository.count()).toEqual(0)
        })

        it('should throw bad request when body is empty', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await categoryRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await categoryRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', 'Bearer toto')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await categoryRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await categoryRepository.count()).toEqual(0)
        })
    })
})
