import { ERRORS_MESSAGES } from "src/common/constants";
import { InstallmentPlan } from "src/modules/installment-plans/installment-plan.entity";
import { InstallmentPlanStatus } from "src/modules/installment-plans/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createInstallmentPlan, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT installment-plans/:id', () => {
    let ctx: TestContext;
    let planRepository: Repository<InstallmentPlan>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const PLAN_DEFAULTS = { label: 'iPhone 15', provider: 'Klarna', totalAmount: 75000, installmentCount: 4, firstDueDate: '2026-11-15', status: InstallmentPlanStatus.ACTIVE, accountId: null, categoryId: null }

    beforeAll(async () => {
        ctx = await createTestApp()
        planRepository = ctx.repo(InstallmentPlan)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should update the label, the provider, the account and the category', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const plan = await createInstallmentPlan(ctx, user)
            const body = { label: 'iPhone 15 Pro', provider: 'Alma', accountId: account.id, categoryId: category.id }

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...PLAN_DEFAULTS, ...body, installmentAmount: 18750, paidCount: 0, remainingDue: 75000 })
            expect(await planRepository.findOneBy({ id: plan.id })).toMatchObject({ ...PLAN_DEFAULTS, ...body })
        })

        it('should keep the paid installments in the derived fields', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user)
            await createTransaction(ctx, user, account, { amount: -18750, installmentId: plan.installments[0].id })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'iPhone 15 Pro' })

            expect(response.body.data).toMatchObject({ paidCount: 1, remainingDue: 56250, nextInstallment: { index: 2 } })
        })

        it('should remove the provider and unlink the account and the category', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id, categoryId: category.id })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ provider: null, accountId: null, categoryId: null })

            expect(response.statusCode).toBe(200)
            expect(await planRepository.findOneBy({ id: plan.id })).toMatchObject({ ...PLAN_DEFAULTS, provider: null })
        })

        it('should cancel the plan', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ status: InstallmentPlanStatus.CANCELLED })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.status).toBe(InstallmentPlanStatus.CANCELLED)
            expect(await planRepository.findOneBy({ id: plan.id })).toMatchObject({ status: InstallmentPlanStatus.CANCELLED })
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['label', ''],
            ['label', null],
            ['provider', ''],
            ['status', InstallmentPlanStatus.ACTIVE],
            ['status', InstallmentPlanStatus.COMPLETED],
            ['status', null],
            ['accountId', 'toto'],
            ['categoryId', 'toto'],
            ['totalAmount', 80000],
            ['installmentCount', 5],
            ['firstDueDate', '2026-12-15'],
            ['userId', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await planRepository.findOneBy({ id: plan.id })).toMatchObject(PLAN_DEFAULTS)
        })

        it('should throw conflict when the plan is cancelled', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user, { status: InstallmentPlanStatus.CANCELLED })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'iPhone 15 Pro' })

            expect(response.statusCode).toBe(409)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_CANCELLED)
            expect(await planRepository.findOneBy({ id: plan.id })).toMatchObject({ label: 'iPhone 15' })
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/installment-plans/toto')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'iPhone 15 Pro' })

            expect(response.statusCode).toBe(400)
        })

        it('should throw not found when plan does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'iPhone 15 Pro' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND)
        })

        it('should throw not found and keep the plan when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherPlan = await createInstallmentPlan(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${otherPlan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'iPhone 15 Pro' })

            expect(response.statusCode).toBe(404)
            expect(await planRepository.findOneBy({ id: otherPlan.id })).toMatchObject(PLAN_DEFAULTS)
        })

        it.each([
            ['account', 'accountId', createAccount, ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND],
            ['category', 'categoryId', createCategory, ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND],
        ])('should throw not found when the new %s belongs to another user', async (_, field, factory, message) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const other = await factory(ctx, otherUser)
            const plan = await createInstallmentPlan(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: other.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(message)
            expect(await planRepository.findOneBy({ id: plan.id })).toMatchObject(PLAN_DEFAULTS)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${plan.id}`)
                .send({ label: 'iPhone 15 Pro' })

            expect(response.statusCode).toBe(401)
            expect(await planRepository.findOneBy({ id: plan.id })).toMatchObject(PLAN_DEFAULTS)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')
                .send({ label: 'iPhone 15 Pro' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send({ label: 'iPhone 15 Pro' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/installment-plans/${plan.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send({ label: 'iPhone 15 Pro' })

            expect(response.statusCode).toBe(401)
        })
    })
})
