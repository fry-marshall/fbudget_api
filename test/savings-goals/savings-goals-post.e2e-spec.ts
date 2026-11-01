import { ERRORS_MESSAGES } from "src/common/constants";
import { SavingsGoal } from "src/modules/savings-goals/savings-goal.entity";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST savings-goals', () => {
    let ctx: TestContext;
    let savingsGoalRepository: Repository<SavingsGoal>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const VALID_BODY = { label: 'Apport voiture', monthlyContribution: 20000, targetAmount: 300000, targetDate: '2027-10-01' }

    beforeAll(async () => {
        ctx = await createTestApp()
        savingsGoalRepository = ctx.repo(SavingsGoal)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should create a savings goal linked to an account and return it without contribution', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: account.id })

            const savingsGoal = await savingsGoalRepository.findOneBy({ userId: user.id })
            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({
                id: savingsGoal!.id,
                ...VALID_BODY,
                dayOfMonth: null,
                hasGoal: true,
                currentAmount: 0,
                progressPct: 0,
                projectedMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
                accountId: account.id,
                createdAt: savingsGoal!.createdAt!.toISOString(),
            })
            expect(savingsGoal).toMatchObject({ ...VALID_BODY, accountId: account.id })
        })

        it('should create a plain recurring transfer without target', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Livret A', monthlyContribution: 5000 })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({ targetAmount: null, targetDate: null, hasGoal: false, currentAmount: 0, progressPct: null, projectedMonth: null, accountId: null })
        })

        it.each([
            ['monthlyContribution', 1],
            ['monthlyContribution', 2147483647],
            ['targetAmount', 1],
            ['targetDate', '2020-01-01'],
            ['accountId', null],
            ['dayOfMonth', 1],
            ['dayOfMonth', 31],
            ['dayOfMonth', null],
        ])('should accept %s %p', async (field, value) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(201)
            expect(response.body.data[field]).toBe(value)
        })

        it('should accept a null target amount with a null target date', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, targetAmount: null, targetDate: null })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({ targetAmount: null, targetDate: null, hasGoal: false })
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['label', undefined],
            ['label', ''],
            ['label', null],
            ['monthlyContribution', undefined],
            ['monthlyContribution', null],
            ['monthlyContribution', 0],
            ['monthlyContribution', -1],
            ['monthlyContribution', 15.5],
            ['monthlyContribution', '20000'],
            ['monthlyContribution', 2147483648],
            ['targetAmount', 0],
            ['targetAmount', -1],
            ['targetAmount', 15.5],
            ['targetAmount', 2147483648],
            ['targetDate', '2027-02-30'],
            ['targetDate', '2027-10-01T00:00:00Z'],
            ['targetDate', '01/10/2027'],
            ['accountId', 'toto'],
            ['dayOfMonth', 0],
            ['dayOfMonth', 32],
            ['dayOfMonth', 15.5],
            ['dayOfMonth', '28'],
            ['hasGoal', true],
            ['currentAmount', 120000],
            ['userId', UNKNOWN_ID],
            ['id', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await savingsGoalRepository.count()).toEqual(0)
        })

        it.each([
            ['targetAmount is missing', { label: 'Vacances', monthlyContribution: 10000, targetDate: '2027-07-01' }],
            ['targetAmount is null', { label: 'Vacances', monthlyContribution: 10000, targetAmount: null, targetDate: '2027-07-01' }],
        ])('should throw bad request when a target date is sent and %s', async (_, body) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.TARGET_AMOUNT_REQUIRED)
            expect(await savingsGoalRepository.count()).toEqual(0)
        })

        it('should throw not found when account does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await savingsGoalRepository.count()).toEqual(0)
        })

        it('should throw not found when account belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await savingsGoalRepository.count()).toEqual(0)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await ctx.repo(User).delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await savingsGoalRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await savingsGoalRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', 'Bearer toto')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await savingsGoalRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await savingsGoalRepository.count()).toEqual(0)
        })
    })
})
