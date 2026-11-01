import { InstallmentPlanStatus, InstallmentStatus } from "src/modules/installment-plans/types";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createInstallmentPlan, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET installment-plans', () => {
    let ctx: TestContext;

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
        it('should return an empty list when user has no plan', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the plans with their derived fields, oldest first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const iphone = await createInstallmentPlan(ctx, user, { firstDueDate: '2099-01-15', accountId: account.id, categoryId: category.id })
            const sofa = await createInstallmentPlan(ctx, user, { label: 'Canapé', provider: null, totalAmount: 89000, installmentCount: 10, firstDueDate: '2020-01-10' })
            await createTransaction(ctx, user, account, { amount: -8900, installmentId: sofa.installments[0].id })
            await createTransaction(ctx, user, account, { amount: -8900, installmentId: sofa.installments[1].id })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual([
                {
                    id: iphone.id,
                    label: 'iPhone 15',
                    provider: 'Klarna',
                    totalAmount: 75000,
                    installmentCount: 4,
                    installmentAmount: 18750,
                    firstDueDate: '2099-01-15',
                    status: InstallmentPlanStatus.ACTIVE,
                    paidCount: 0,
                    remainingDue: 75000,
                    nextInstallment: { id: iphone.installments[0].id, index: 1, dueDate: '2099-01-15', amount: 18750, status: InstallmentStatus.FUTURE, transactionId: null, paidOn: null },
                    accountId: account.id,
                    categoryId: category.id,
                    createdAt: iphone.createdAt!.toISOString(),
                },
                {
                    id: sofa.id,
                    label: 'Canapé',
                    provider: null,
                    totalAmount: 89000,
                    installmentCount: 10,
                    installmentAmount: 8900,
                    firstDueDate: '2020-01-10',
                    status: InstallmentPlanStatus.ACTIVE,
                    paidCount: 2,
                    remainingDue: 71200,
                    nextInstallment: { id: sofa.installments[2].id, index: 3, dueDate: '2020-03-10', amount: 8900, status: InstallmentStatus.DUE, transactionId: null, paidOn: null },
                    accountId: null,
                    categoryId: null,
                    createdAt: sofa.createdAt!.toISOString(),
                },
            ])
        })

        it('should return a completed plan when every installment is paid', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { totalAmount: 10000, installmentCount: 2 })
            for (const installment of plan.installments) {
                await createTransaction(ctx, user, account, { amount: -installment.amount!, installmentId: installment.id })
            }

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data[0]).toMatchObject({ status: InstallmentPlanStatus.COMPLETED, paidCount: 2, remainingDue: 0, nextInstallment: null })
        })

        it('should hide the cancelled plans', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)
            await createInstallmentPlan(ctx, user, { status: InstallmentPlanStatus.CANCELLED })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((plan) => plan.id)).toEqual([plan.id])
        })

        it('should not return the plans of other users', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const plan = await createInstallmentPlan(ctx, user)
            await createInstallmentPlan(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((plan) => plan.id)).toEqual([plan.id])
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
