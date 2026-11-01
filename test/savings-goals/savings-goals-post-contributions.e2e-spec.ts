import { ERRORS_MESSAGES } from "src/common/constants";
import { Account } from "src/modules/accounts/account.entity";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createSavingsGoal, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST savings-goals/:id/contributions', () => {
    let ctx: TestContext;
    let transactionRepository: Repository<Transaction>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const VALID_BODY = { amount: 20000, occurredOn: '2026-11-01' }

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
        it('should create a negative savings transaction on the account of the goal and return the updated goal', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user, { accountId: account.id })
            await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: goal.id, amount: -100000 })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            const transaction = await transactionRepository.findOneBy({ id: response.body.data.transaction.id })
            expect(response.statusCode).toBe(201)
            expect(response.body.data.savingsGoal).toMatchObject({ id: goal.id, currentAmount: 120000, progressPct: 40 })
            expect(response.body.data.transaction).toStrictEqual({
                id: transaction!.id,
                amount: -20000,
                occurredOn: '2026-11-01',
                accountId: account.id,
                categoryId: null,
                merchant: 'Apport voiture',
                note: null,
                tags: [],
                sourceType: TransactionSourceType.SAVINGS,
                provisionId: null,
                installmentId: null,
                savingsGoalId: goal.id,
                createdAt: transaction!.createdAt!.toISOString(),
            })
        })

        it('should debit the account sent instead of the account of the goal', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const otherAccount = await createAccount(ctx, user, { name: 'Wave' })
            const goal = await createSavingsGoal(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: otherAccount.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.transaction.accountId).toBe(otherAccount.id)
        })

        it('should lower the balance of the debited account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { initialBalance: 100000 })
            const goal = await createSavingsGoal(ctx, user)

            await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: account.id })
            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${account.id}/balance`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.balance).toBe(80000)
        })

        it('should accept a contribution once the target is reached', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user, { accountId: account.id })
            await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: goal.id, amount: -300000 })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(201)
            expect(response.body.data.savingsGoal).toMatchObject({ currentAmount: 320000, progressPct: 100, projectedMonth: null })
        })

        it('should contribute to a plain recurring transfer without target', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user, { targetAmount: null, targetDate: null, accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(201)
            expect(response.body.data.savingsGoal).toMatchObject({ hasGoal: false, currentAmount: 20000, progressPct: null })
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['amount', undefined],
            ['amount', null],
            ['amount', 0],
            ['amount', -20000],
            ['amount', 15.5],
            ['amount', '20000'],
            ['amount', 2147483648],
            ['occurredOn', undefined],
            ['occurredOn', null],
            ['occurredOn', '2026-02-30'],
            ['occurredOn', '2026-11-01T10:00:00Z'],
            ['accountId', null],
            ['accountId', 'toto'],
            ['sourceType', TransactionSourceType.MANUAL],
            ['savingsGoalId', UNKNOWN_ID],
            ['categoryId', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw bad request when neither the body nor the savings goal has an account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const goal = await createSavingsGoal(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.ACCOUNT_REQUIRED)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw bad request when the account of the savings goal was deleted', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user, { accountId: account.id })
            await ctx.repo(Account).delete(account.id!)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.ACCOUNT_REQUIRED)
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/savings-goals/toto/contributions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when savings goal does not exist', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${UNKNOWN_ID}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: account.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw not found when savings goal belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const otherGoal = await createSavingsGoal(ctx, otherUser, { accountId: otherAccount.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${otherGoal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
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
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${UNKNOWN_ID}/contributions`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${UNKNOWN_ID}/contributions`)
                .set('Authorization', 'Bearer toto')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user, { accountId: account.id })
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const goal = await createSavingsGoal(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/savings-goals/${goal.id}/contributions`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })
    })
})
