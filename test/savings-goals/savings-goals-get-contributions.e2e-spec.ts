import { ERRORS_MESSAGES } from "src/common/constants";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createSavingsGoal, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET savings-goals/:id/contributions', () => {
    let ctx: TestContext;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

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
        it('should return an empty list when the savings goal has no contribution', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the contributions of the savings goal whatever their month, most recent first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user)
            const otherGoal = await createSavingsGoal(ctx, user, { label: 'Livret A', targetAmount: null, targetDate: null })
            const contribution = { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: goal.id }
            const old = await createTransaction(ctx, user, account, { ...contribution, amount: -100000, occurredOn: '2025-12-01' })
            const last = await createTransaction(ctx, user, account, { ...contribution, amount: -20000, occurredOn: '2026-10-01' })
            await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: otherGoal.id })
            await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.map((transaction) => transaction.id)).toEqual([last.id, old.id])
            expect(response.body.data[0]).toMatchObject({ amount: -20000, sourceType: TransactionSourceType.SAVINGS, savingsGoalId: goal.id })
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/savings-goals/toto/contributions')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when savings goal does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/savings-goals/${UNKNOWN_ID}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
        })

        it('should throw not found when savings goal belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const otherGoal = await createSavingsGoal(ctx, otherUser)
            await createTransaction(ctx, otherUser, otherAccount, { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: otherGoal.id })

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/savings-goals/${otherGoal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/savings-goals/${UNKNOWN_ID}/contributions`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/savings-goals/${UNKNOWN_ID}/contributions`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
