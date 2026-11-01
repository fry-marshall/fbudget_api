import { addMonthsToDate } from "src/common/helpers/helpers";
import { Account } from "src/modules/accounts/account.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createSavingsGoal, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET savings-goals', () => {
    let ctx: TestContext;

    const inMonths = (months: number) => addMonthsToDate(`${new Date().toISOString().slice(0, 7)}-01`, months).slice(0, 7)

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
        it('should return an empty list when the user has no savings goal', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the savings goals with their current amount, progress and projection, oldest first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const car = await createSavingsGoal(ctx, user, { accountId: account.id })
            const livretA = await createSavingsGoal(ctx, user, { label: 'Livret A', targetAmount: null, targetDate: null, monthlyContribution: 5000 })
            const contribution = { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: car.id }
            await createTransaction(ctx, user, account, { ...contribution, amount: -100000, occurredOn: '2026-09-01' })
            await createTransaction(ctx, user, account, { ...contribution, amount: -20000, occurredOn: '2026-10-01' })
            await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: livretA.id, amount: -5000 })
            await createTransaction(ctx, user, account, { amount: -999999 })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual([
                {
                    id: car.id,
                    label: 'Apport voiture',
                    monthlyContribution: 20000,
                    targetAmount: 300000,
                    targetDate: '2027-10-01',
                    hasGoal: true,
                    currentAmount: 120000,
                    progressPct: 40,
                    projectedMonth: inMonths(9),
                    accountId: account.id,
                    createdAt: car.createdAt!.toISOString(),
                },
                {
                    id: livretA.id,
                    label: 'Livret A',
                    monthlyContribution: 5000,
                    targetAmount: null,
                    targetDate: null,
                    hasGoal: false,
                    currentAmount: 5000,
                    progressPct: null,
                    projectedMonth: null,
                    accountId: null,
                    createdAt: livretA.createdAt!.toISOString(),
                },
            ])
        })

        it('should cap the progress at 100 and stop the projection once the target is reached', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user)
            await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: goal.id, amount: -310000 })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data[0]).toMatchObject({ currentAmount: 310000, progressPct: 100, projectedMonth: null })
        })

        it('should still count the contributions made from a deleted account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user, { accountId: account.id })
            await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: goal.id, amount: -20000 })
            await ctx.repo(Account).delete(account.id!)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data[0]).toMatchObject({ currentAmount: 20000, accountId: null })
        })

        it('should not return the savings goals of other users', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const goal = await createSavingsGoal(ctx, user)
            await createSavingsGoal(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((savingsGoal) => savingsGoal.id)).toEqual([goal.id])
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/savings-goals')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/savings-goals')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/savings-goals')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
