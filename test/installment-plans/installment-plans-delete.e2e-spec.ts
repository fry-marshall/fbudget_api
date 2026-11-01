import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { InstallmentPlan } from "src/modules/installment-plans/installment-plan.entity";
import { Installment } from "src/modules/installment-plans/installment.entity";
import { InstallmentPlanStatus } from "src/modules/installment-plans/types";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createInstallmentPlan, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('DELETE installment-plans/:id', () => {
    let ctx: TestContext;
    let planRepository: Repository<InstallmentPlan>;
    let installmentRepository: Repository<Installment>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

    beforeAll(async () => {
        ctx = await createTestApp()
        planRepository = ctx.repo(InstallmentPlan)
        installmentRepository = ctx.repo(Installment)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should delete the plan and its installments and keep the other plans', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)
            const otherPlan = await createInstallmentPlan(ctx, user, { label: 'Canapé' })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.message).toBe(SUCCESS_MESSAGES.INSTALLMENT_PLAN.INSTALLMENT_PLAN_DELETED)
            expect(await planRepository.findOneBy({ id: plan.id })).toBeNull()
            expect(await installmentRepository.countBy({ planId: plan.id })).toEqual(0)
            expect(await installmentRepository.countBy({ planId: otherPlan.id })).toEqual(4)
        })

        it('should keep the payment transactions without installment', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user)
            const payment = await createTransaction(ctx, user, account, { amount: -18750, sourceType: TransactionSourceType.INSTALLMENT, installmentId: plan.installments[0].id })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await ctx.repo(Transaction).findOneBy({ id: payment.id })).toMatchObject({ installmentId: null, amount: -18750, sourceType: TransactionSourceType.INSTALLMENT })
        })

        it('should delete a cancelled plan', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user, { status: InstallmentPlanStatus.CANCELLED })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await planRepository.findOneBy({ id: plan.id })).toBeNull()
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/installment-plans/toto')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
        })

        it('should throw not found when plan does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/installment-plans/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND)
        })

        it('should throw not found and keep the plan when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherPlan = await createInstallmentPlan(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/installment-plans/${otherPlan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(await planRepository.findOneBy({ id: otherPlan.id })).not.toBeNull()
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/installment-plans/${plan.id}`)

            expect(response.statusCode).toBe(401)
            expect(await planRepository.findOneBy({ id: plan.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await planRepository.findOneBy({ id: plan.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await planRepository.findOneBy({ id: plan.id })).not.toBeNull()
        })
    })
})
