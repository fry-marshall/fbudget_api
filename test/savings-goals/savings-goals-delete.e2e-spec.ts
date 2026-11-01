import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { SavingsGoal } from "src/modules/savings-goals/savings-goal.entity";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createSavingsGoal, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('DELETE savings-goals/:id', () => {
    let ctx: TestContext;
    let savingsGoalRepository: Repository<SavingsGoal>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

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
        it('should delete the savings goal', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)
            const otherGoal = await createSavingsGoal(ctx, user, { label: 'Livret A', targetAmount: null, targetDate: null })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.message).toBe(SUCCESS_MESSAGES.SAVINGS_GOAL.SAVINGS_GOAL_DELETED)
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).toBeNull()
            expect(await savingsGoalRepository.findOneBy({ id: otherGoal.id })).not.toBeNull()
        })

        it('should keep the contribution transactions without savings goal', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user)
            const contribution = await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: goal.id, amount: -20000 })

            await request(ctx.app.getHttpServer())
                .delete(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(await ctx.repo(Transaction).findOneBy({ id: contribution.id })).toMatchObject({ savingsGoalId: null, amount: -20000, sourceType: TransactionSourceType.SAVINGS })
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/savings-goals/toto')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when savings goal does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/savings-goals/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
        })

        it('should throw not found when savings goal is already deleted', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            await request(ctx.app.getHttpServer())
                .delete(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
        })

        it('should throw not found and keep the savings goal when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherGoal = await createSavingsGoal(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/savings-goals/${otherGoal.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
            expect(await savingsGoalRepository.findOneBy({ id: otherGoal.id })).not.toBeNull()
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/savings-goals/${UNKNOWN_ID}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/savings-goals/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized and keep the savings goal when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).not.toBeNull()
        })

        it('should throw unauthorized and keep the savings goal when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/savings-goals/${goal.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await savingsGoalRepository.findOneBy({ id: goal.id })).not.toBeNull()
        })
    })
})
