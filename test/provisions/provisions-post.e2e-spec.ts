import { ERRORS_MESSAGES } from "src/common/constants";
import { Provision } from "src/modules/provisions/provision.entity";
import { ProvisionStatus } from "src/modules/provisions/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST provisions', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let provisionRepository: Repository<Provision>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const VALID_BODY = { label: 'Assurance auto', totalAmount: 70000, frequencyMonths: 12, nextDueDate: '2027-03-15', startedAt: '2026-11-01' }

    beforeAll(async () => {
        ctx = await createTestApp()
        userRepository = ctx.repo(User)
        provisionRepository = ctx.repo(Provision)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should create an active provision linked to the account and the category and return it', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: account.id, categoryId: category.id })

            const provisionCreated = await provisionRepository.findOneBy({ userId: user.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({
                id: provisionCreated!.id,
                ...VALID_BODY,
                monthlyAmount: 5834,
                status: ProvisionStatus.ACTIVE,
                accountId: account.id,
                categoryId: category.id,
                createdAt: provisionCreated!.createdAt!.toISOString(),
            })
            expect(provisionCreated).toMatchObject({ ...VALID_BODY, status: ProvisionStatus.ACTIVE, accountId: account.id, categoryId: category.id })
        })

        it('should create the provision without account and category', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({ ...VALID_BODY, accountId: null, categoryId: null })
        })

        it.each([
            ['totalAmount', 1],
            ['totalAmount', 2147483647],
            ['frequencyMonths', 2],
            ['frequencyMonths', 60],
            ['nextDueDate', '2020-01-01'],
            ['accountId', null],
            ['categoryId', null],
        ])('should accept %s %p', async (field, value) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(201)
            expect(response.body.data[field]).toBe(value)
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['label', undefined],
            ['label', ''],
            ['label', null],
            ['totalAmount', undefined],
            ['totalAmount', 0],
            ['totalAmount', -1],
            ['totalAmount', 15.5],
            ['totalAmount', '70000'],
            ['totalAmount', 2147483648],
            ['frequencyMonths', undefined],
            ['frequencyMonths', 1],
            ['frequencyMonths', 61],
            ['frequencyMonths', 2.5],
            ['frequencyMonths', null],
            ['nextDueDate', undefined],
            ['nextDueDate', null],
            ['nextDueDate', '2027-02-30'],
            ['nextDueDate', '2027-03-15T00:00:00Z'],
            ['startedAt', undefined],
            ['startedAt', '01/11/2026'],
            ['accountId', 'toto'],
            ['categoryId', 'toto'],
            ['status', ProvisionStatus.PAUSED],
            ['monthlyAmount', 5834],
            ['userId', UNKNOWN_ID],
            ['id', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await provisionRepository.count()).toEqual(0)
        })

        it.each([
            ['account does not exist', 'accountId', ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND],
            ['category does not exist', 'categoryId', ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND],
        ])('should throw not found when %s', async (_, field, message) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(message)
            expect(await provisionRepository.count()).toEqual(0)
        })

        it('should throw not found when account belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await provisionRepository.count()).toEqual(0)
        })

        it('should throw not found when category belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherCategory = await createCategory(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, categoryId: otherCategory.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
            expect(await provisionRepository.count()).toEqual(0)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await provisionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await provisionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', 'Bearer toto')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await provisionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await provisionRepository.count()).toEqual(0)
        })
    })
})
