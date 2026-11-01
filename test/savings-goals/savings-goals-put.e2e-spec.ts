import { ERRORS_MESSAGES } from "src/common/constants";
import { SavingsGoal } from "src/modules/savings-goals/savings-goal.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createSavingsGoal, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT savings-goals/:id', () => {
    let ctx: TestContext;
    let savingsGoalRepository: Repository<SavingsGoal>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const SAVINGS_GOAL_DEFAULTS = { label: 'Apport voiture', monthlyContribution: 20000, targetAmount: 300000, targetDate: '2027-10-01', accountId: null }

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
        it('should update all the fields and return the savings goal with its current amount', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user)
            await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: goal.id, amount: -37500 })
            const body = { label: 'Vacances été 2027', monthlyContribution: 15000, targetAmount: 150000, targetDate: '2027-07-01', accountId: account.id }

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                id: goal.id,
                ...body,
                hasGoal: true,
                currentAmount: 37500,
                progressPct: 25,
                projectedMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
                createdAt: goal.createdAt!.toISOString(),
            })
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).toMatchObject(body)
        })

        it.each([
            ['rename the savings goal', 'label', 'Apport moto'],
            ['change the monthly contribution', 'monthlyContribution', 25000],
            ['change the target amount', 'targetAmount', 400000],
            ['remove the target date', 'targetDate', null],
        ])('should %s', async (_, field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(200)
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).toMatchObject({ ...SAVINGS_GOAL_DEFAULTS, [field]: value })
        })

        it('should remove the target and the target date together', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ targetAmount: null, targetDate: null })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ targetAmount: null, targetDate: null, hasGoal: false, progressPct: null, projectedMonth: null })
        })

        it('should add a target and a target date to a plain recurring transfer', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user, { targetAmount: null, targetDate: null })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ targetAmount: 100000, targetDate: '2027-12-01' })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ targetAmount: 100000, targetDate: '2027-12-01', hasGoal: true, progressPct: 0 })
        })

        it('should unlink the account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ accountId: null })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.accountId).toBeNull()
        })

        it('should keep the savings goal unchanged with an empty body', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(200)
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).toMatchObject(SAVINGS_GOAL_DEFAULTS)
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['label', ''],
            ['label', null],
            ['monthlyContribution', 0],
            ['monthlyContribution', null],
            ['monthlyContribution', 15.5],
            ['monthlyContribution', 2147483648],
            ['targetAmount', 0],
            ['targetAmount', '300000'],
            ['targetDate', '2027-02-30'],
            ['accountId', 'toto'],
            ['hasGoal', false],
            ['currentAmount', 0],
            ['userId', UNKNOWN_ID],
            ['id', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).toMatchObject(SAVINGS_GOAL_DEFAULTS)
        })

        it('should throw bad request when the target is removed but the target date is kept', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ targetAmount: null })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.TARGET_AMOUNT_REQUIRED)
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).toMatchObject(SAVINGS_GOAL_DEFAULTS)
        })

        it('should throw bad request when a target date is set on a goal without target', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user, { targetAmount: null, targetDate: null })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ targetDate: '2027-12-01' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.TARGET_AMOUNT_REQUIRED)
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/savings-goals/toto')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Vacances' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when savings goal does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Vacances' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
        })

        it('should throw not found when savings goal belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherGoal = await createSavingsGoal(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${otherGoal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Vacances' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
            expect(await savingsGoalRepository.findOneBy({ id: otherGoal.id })).toMatchObject(SAVINGS_GOAL_DEFAULTS)
        })

        it.each([
            ['does not exist', false],
            ['belongs to another user', true],
        ])('should throw not found when account %s', async (_, ownedByOtherUser) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)
            let accountId = UNKNOWN_ID
            if (ownedByOtherUser) {
                const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
                accountId = (await createAccount(ctx, otherUser)).id!
            }

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ accountId })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).toMatchObject(SAVINGS_GOAL_DEFAULTS)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${UNKNOWN_ID}`)
                .send({ label: 'Vacances' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')
                .send({ label: 'Vacances' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send({ label: 'Vacances' })

            expect(response.statusCode).toBe(401)
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).toMatchObject(SAVINGS_GOAL_DEFAULTS)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send({ label: 'Vacances' })

            expect(response.statusCode).toBe(401)
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).toMatchObject(SAVINGS_GOAL_DEFAULTS)
        })
    })
})
