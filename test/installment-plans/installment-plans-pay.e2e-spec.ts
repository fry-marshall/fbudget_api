import { ERRORS_MESSAGES } from "src/common/constants";
import { InstallmentPlanStatus, InstallmentStatus } from "src/modules/installment-plans/types";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createInstallmentPlan, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST installment-plans/:id/installments/:installmentId/pay', () => {
    let ctx: TestContext;
    let transactionRepository: Repository<Transaction>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const VALID_BODY = { occurredOn: '2026-11-15' }

    beforeAll(async () => {
        ctx = await createTestApp()
        transactionRepository = ctx.repo(Transaction)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should create the expense on the plan account and return the paid installment', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id, categoryId: category.id })
            const installment = plan.installments[0]

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${installment.id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            const transactionCreated = await transactionRepository.findOneBy({ installmentId: installment.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({
                installment: { id: installment.id, index: 1, dueDate: '2026-11-15', amount: 18750, status: InstallmentStatus.PAID, transactionId: transactionCreated!.id, paidOn: '2026-11-15' },
                transaction: {
                    id: transactionCreated!.id,
                    amount: -18750,
                    occurredOn: '2026-11-15',
                    accountId: account.id,
                    categoryId: category.id,
                    merchant: 'iPhone 15',
                    note: null,
                    tags: [],
                    sourceType: TransactionSourceType.INSTALLMENT,
                    provisionId: null,
                    installmentId: installment.id,
                    savingsGoalId: null,
                    transferId: null,
                    createdAt: transactionCreated!.createdAt!.toISOString(),
                },
            })
        })

        it('should pay the last installment with its remainder on the account sent', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { totalAmount: 10000, installmentCount: 3 })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${plan.installments[2].id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: account.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.transaction).toMatchObject({ amount: -3334, accountId: account.id })
        })

        it('should complete the plan once every installment is paid', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id, totalAmount: 10000, installmentCount: 2 })

            for (const installment of plan.installments) {
                await request(ctx.app.getHttpServer())
                    .post(`/api/v1/installment-plans/${plan.id}/installments/${installment.id}/pay`)
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send(VALID_BODY)
            }

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data[0]).toMatchObject({ status: InstallmentPlanStatus.COMPLETED, paidCount: 2, remainingDue: 0 })
        })

        it('should lower the balance of the debited account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id })

            await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${plan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${account.id}/balance`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.balance).toBe(150000 - 18750)
        })
    })

    describe('Failure cases', () => {
        it('should throw conflict when the installment is already paid', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id })
            await createTransaction(ctx, user, account, { amount: -18750, installmentId: plan.installments[0].id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${plan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(409)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_ALREADY_PAID)
            expect(await transactionRepository.count()).toEqual(1)
        })

        it('should pay the installment only once when paying it in parallel', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id })

            const responses = await Promise.all(Array.from({ length: 3 }, () => request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${plan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)
            ))

            expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409, 409])
            expect(await transactionRepository.count()).toEqual(1)
        })

        it('should throw conflict when the plan is cancelled', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id, status: InstallmentPlanStatus.CANCELLED })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${plan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(409)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_CANCELLED)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw bad request when neither the plan nor the body has an account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const plan = await createInstallmentPlan(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${plan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INSTALLMENT_PLANS.ACCOUNT_REQUIRED)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it.each([
            ['occurredOn', undefined],
            ['occurredOn', '2026-02-30'],
            ['accountId', 'toto'],
            ['accountId', null],
            ['amount', 18750],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${plan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw not found when the installment belongs to another plan of the user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id })
            const otherPlan = await createInstallmentPlan(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${otherPlan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw not found when the plan belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const otherPlan = await createInstallmentPlan(ctx, otherUser, { accountId: otherAccount.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${otherPlan.id}/installments/${otherPlan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw not found when the account sent belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const plan = await createInstallmentPlan(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${plan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it.each([
            ['the plan id', `toto/installments/${UNKNOWN_ID}`],
            ['the installment id', `${UNKNOWN_ID}/installments/toto`],
        ])('should throw bad request when %s is not a uuid', async (_, path) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${path}/pay`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(400)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${UNKNOWN_ID}/installments/${UNKNOWN_ID}/pay`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id })
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${plan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const plan = await createInstallmentPlan(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/installment-plans/${plan.id}/installments/${plan.installments[0].id}/pay`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })
    })
})
