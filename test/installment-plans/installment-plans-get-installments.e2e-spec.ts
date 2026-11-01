import { ERRORS_MESSAGES } from "src/common/constants";
import { InstallmentPlanStatus, InstallmentStatus } from "src/modules/installment-plans/types";
import { Transaction } from "src/modules/transactions/transaction.entity";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createInstallmentPlan, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET installment-plans/:id/installments', () => {
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
        it('should return the installments by index with their paid, due and future status', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { firstDueDate: '2020-01-15' })
            const future = await createInstallmentPlan(ctx, user, { firstDueDate: '2099-01-15' })
            const payment = await createTransaction(ctx, user, account, { amount: -18750, occurredOn: '2020-01-14', installmentId: plan.installments[0].id })

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/installment-plans/${plan.id}/installments`)
                .set('Authorization', `Bearer ${accessToken}`)
            const futureResponse = await request(ctx.app.getHttpServer())
                .get(`/api/v1/installment-plans/${future.id}/installments`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual([
                { id: plan.installments[0].id, index: 1, dueDate: '2020-01-15', amount: 18750, status: InstallmentStatus.PAID, transactionId: payment.id, paidOn: '2020-01-14' },
                { id: plan.installments[1].id, index: 2, dueDate: '2020-02-15', amount: 18750, status: InstallmentStatus.DUE, transactionId: null, paidOn: null },
                { id: plan.installments[2].id, index: 3, dueDate: '2020-03-15', amount: 18750, status: InstallmentStatus.DUE, transactionId: null, paidOn: null },
                { id: plan.installments[3].id, index: 4, dueDate: '2020-04-15', amount: 18750, status: InstallmentStatus.DUE, transactionId: null, paidOn: null },
            ])
            expect(futureResponse.body.data.map((installment) => installment.status)).toEqual(Array(4).fill(InstallmentStatus.FUTURE))
        })

        it('should make an installment unpaid again when its payment transaction is deleted', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { firstDueDate: '2020-01-15' })
            const payment = await createTransaction(ctx, user, account, { amount: -18750, installmentId: plan.installments[0].id })

            await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${payment.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/installment-plans/${plan.id}/installments`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(await ctx.repo(Transaction).findOneBy({ id: payment.id })).toBeNull()
            expect(response.body.data[0]).toMatchObject({ status: InstallmentStatus.DUE, transactionId: null, paidOn: null })
        })

        it('should return the installments of a cancelled plan', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user, { status: InstallmentPlanStatus.CANCELLED })

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/installment-plans/${plan.id}/installments`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toHaveLength(4)
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans/toto/installments')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
        })

        it('should throw not found when plan does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/installment-plans/${UNKNOWN_ID}/installments`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND)
        })

        it('should throw not found when plan belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherPlan = await createInstallmentPlan(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/installment-plans/${otherPlan.id}/installments`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/installment-plans/${UNKNOWN_ID}/installments`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/installment-plans/${plan.id}/installments`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/installment-plans/${plan.id}/installments`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
