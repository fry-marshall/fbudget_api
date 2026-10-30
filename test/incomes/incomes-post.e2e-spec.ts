import { ERRORS_MESSAGES } from "src/common/constants";
import { Income } from "src/modules/incomes/income.entity";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST incomes', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let incomeRepository: Repository<Income>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const VALID_BODY = { label: 'Salaire', amount: 248000, dayOfMonth: 28, isVariable: false }

    beforeAll(async () => {
        ctx = await createTestApp()
        userRepository = ctx.repo(User)
        incomeRepository = ctx.repo(Income)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should create the income linked to the account and return it', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: account.id })

            const incomeCreated = await incomeRepository.findOneBy({ userId: user.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({
                id: incomeCreated!.id,
                label: 'Salaire',
                amount: 248000,
                dayOfMonth: 28,
                isVariable: false,
                accountId: account.id,
                createdAt: incomeCreated!.createdAt!.toISOString(),
            })
            expect(incomeCreated).toMatchObject({ ...VALID_BODY, accountId: account.id })
        })

        it('should create the income with only a label and an amount', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Freelance', amount: 50000 })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({ label: 'Freelance', amount: 50000, dayOfMonth: null, isVariable: false, accountId: null })
        })

        it.each([
            ['amount', 1],
            ['amount', 2147483647],
            ['dayOfMonth', 1],
            ['dayOfMonth', 31],
            ['dayOfMonth', null],
            ['isVariable', true],
            ['accountId', null],
        ])('should accept %s %p', async (field, value) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
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
            ['label', 123],
            ['label', null],
            ['amount', undefined],
            ['amount', 0],
            ['amount', -1],
            ['amount', 15.5],
            ['amount', '248000'],
            ['amount', 2147483648],
            ['amount', null],
            ['dayOfMonth', 0],
            ['dayOfMonth', 32],
            ['dayOfMonth', 15.5],
            ['dayOfMonth', '28'],
            ['isVariable', 'true'],
            ['isVariable', 1],
            ['accountId', 'toto'],
            ['accountId', 123],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await incomeRepository.countBy({ userId: user.id })).toEqual(0)
        })

        it.each([
            ['userId', UNKNOWN_ID],
            ['id', UNKNOWN_ID],
            ['currency', 'EUR'],
        ])('should throw bad request when %s is sent', async (field, value) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await incomeRepository.count()).toEqual(0)
        })

        it('should throw not found when account does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await incomeRepository.count()).toEqual(0)
        })

        it('should throw not found when account belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await incomeRepository.count()).toEqual(0)
        })

        it('should throw bad request when body is empty', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await incomeRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await incomeRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', 'Bearer toto')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await incomeRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/incomes')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await incomeRepository.count()).toEqual(0)
        })
    })
})
