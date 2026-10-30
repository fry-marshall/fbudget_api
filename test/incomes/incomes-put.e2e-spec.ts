import { ERRORS_MESSAGES } from "src/common/constants";
import { Income } from "src/modules/incomes/income.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createIncome, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT incomes/:id', () => {
    let ctx: TestContext;
    let incomeRepository: Repository<Income>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const INCOME_DEFAULTS = { label: 'Salaire', amount: 248000, dayOfMonth: null, isVariable: false, accountId: null }

    beforeAll(async () => {
        ctx = await createTestApp()
        incomeRepository = ctx.repo(Income)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should update all the fields and return the income', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const income = await createIncome(ctx, user)
            const body = { label: 'Freelance', amount: 50000, dayOfMonth: 5, isVariable: true, accountId: account.id }

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                id: income.id,
                ...body,
                createdAt: income.createdAt!.toISOString(),
            })
            expect(await incomeRepository.findOneBy({ id: income.id })).toMatchObject(body)
        })

        it.each([
            ['label', 'Freelance'],
            ['amount', 1],
            ['amount', 2147483647],
            ['dayOfMonth', 31],
            ['isVariable', true],
        ])('should only update %s to %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...INCOME_DEFAULTS, [field]: value })
            expect(await incomeRepository.findOneBy({ id: income.id })).toMatchObject({ ...INCOME_DEFAULTS, [field]: value })
        })

        it('should unset the day of month and unlink the account when they are null', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const income = await createIncome(ctx, user, { dayOfMonth: 28, accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ dayOfMonth: null, accountId: null })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject(INCOME_DEFAULTS)
            expect(await incomeRepository.findOneBy({ id: income.id })).toMatchObject(INCOME_DEFAULTS)
        })

        it('should leave the income unchanged when body is empty', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user, { dayOfMonth: 28 })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...INCOME_DEFAULTS, dayOfMonth: 28 })
        })

        it('should not update the other incomes', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)
            const otherIncome = await createIncome(ctx, user, { label: 'Freelance' })

            await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ amount: 1 })

            expect(await incomeRepository.findOneBy({ id: otherIncome.id })).toMatchObject({ label: 'Freelance', amount: 248000 })
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['label', ''],
            ['label', 123],
            ['label', null],
            ['amount', 0],
            ['amount', -1],
            ['amount', 15.5],
            ['amount', '248000'],
            ['amount', 2147483648],
            ['amount', null],
            ['dayOfMonth', 0],
            ['dayOfMonth', 32],
            ['dayOfMonth', '28'],
            ['isVariable', 'true'],
            ['isVariable', null],
            ['accountId', 'toto'],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await incomeRepository.findOneBy({ id: income.id })).toMatchObject(INCOME_DEFAULTS)
        })

        it.each([
            ['userId', UNKNOWN_ID],
            ['id', UNKNOWN_ID],
        ])('should throw bad request when %s is sent', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Freelance', [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await incomeRepository.findOneBy({ id: income.id })).toMatchObject({ ...INCOME_DEFAULTS, userId: user.id })
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/incomes/toto')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Freelance' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when income does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Freelance' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INCOMES.INCOME_NOT_FOUND)
        })

        it('should throw not found and keep the income when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherIncome = await createIncome(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${otherIncome.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Freelance' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INCOMES.INCOME_NOT_FOUND)
            expect(await incomeRepository.findOneBy({ id: otherIncome.id })).toMatchObject(INCOME_DEFAULTS)
        })

        it('should throw not found when account does not exist', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ accountId: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await incomeRepository.findOneBy({ id: income.id })).toMatchObject(INCOME_DEFAULTS)
        })

        it('should throw not found and keep the income unlinked when account belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const income = await createIncome(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ accountId: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await incomeRepository.findOneBy({ id: income.id })).toMatchObject(INCOME_DEFAULTS)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .send({ label: 'Freelance' })

            expect(response.statusCode).toBe(401)
            expect(await incomeRepository.findOneBy({ id: income.id })).toMatchObject(INCOME_DEFAULTS)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')
                .send({ label: 'Freelance' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send({ label: 'Freelance' })

            expect(response.statusCode).toBe(401)
            expect(await incomeRepository.findOneBy({ id: income.id })).toMatchObject(INCOME_DEFAULTS)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send({ label: 'Freelance' })

            expect(response.statusCode).toBe(401)
            expect(await incomeRepository.findOneBy({ id: income.id })).toMatchObject(INCOME_DEFAULTS)
        })
    })
})
