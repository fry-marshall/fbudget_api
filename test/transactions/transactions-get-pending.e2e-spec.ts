import { addMonthsToDate } from "src/common/helpers/helpers";
import { TransactionSourceType, TransactionStatus } from "src/modules/transactions/types";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createTransaction, createTransfer, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";
import { Transaction } from "src/modules/transactions/transaction.entity";

describe('GET transactions/pending', () => {
    let ctx: TestContext;

    // The window depends on the day the tests run
    const currentMonthStart = `${new Date().toISOString().slice(0, 7)}-01`
    const previousMonthStart = addMonthsToDate(currentMonthStart, -1)
    const lastDayOfCurrentMonth = new Date(new Date(`${addMonthsToDate(currentMonthStart, 1)}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)

    beforeAll(async () => {
        ctx = await createTestApp()
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    const getPending = (accessToken: string) => request(ctx.app.getHttpServer())
        .get('/api/v1/transactions/pending')
        .set('Authorization', `Bearer ${accessToken}`)

    describe('Success cases', () => {
        it('should return an empty list when user has no pending transaction', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            await createTransaction(ctx, user, account, { occurredOn: currentMonthStart })

            const response = await getPending(accessToken)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the pending transactions of the previous and the current month with all fields, oldest first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const lastDay = await createTransaction(ctx, user, account, { amount: -85000, occurredOn: lastDayOfCurrentMonth, status: TransactionStatus.PENDING, sourceType: TransactionSourceType.FIXED_CHARGE, merchant: 'Loyer' })
            const firstDay = await createTransaction(ctx, user, account, { amount: 248000, occurredOn: previousMonthStart, status: TransactionStatus.PENDING, sourceType: TransactionSourceType.INCOME })
            await createTransaction(ctx, user, account, { occurredOn: addMonthsToDate(previousMonthStart, -1), status: TransactionStatus.PENDING })
            await createTransaction(ctx, user, account, { occurredOn: addMonthsToDate(currentMonthStart, 1), status: TransactionStatus.PENDING })
            await createTransaction(ctx, user, account, { occurredOn: currentMonthStart })

            const response = await getPending(accessToken)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.map(({ id }: Transaction) => id)).toEqual([firstDay.id, lastDay.id])
            expect(response.body.data[1]).toStrictEqual({
                id: lastDay.id,
                amount: -85000,
                occurredOn: lastDayOfCurrentMonth,
                accountId: account.id,
                categoryId: null,
                merchant: 'Loyer',
                note: null,
                tags: [],
                sourceType: TransactionSourceType.FIXED_CHARGE,
                status: TransactionStatus.PENDING,
                provisionId: null,
                installmentId: null,
                savingsGoalId: null,
                transferId: null,
                fixedChargeId: null,
                incomeId: null,
                createdAt: lastDay.createdAt!.toISOString(),
            })
        })

        it('should return both transactions of a pending transfer, debit first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { isPrimary: true })
            const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions' })
            const { transferId, from, to } = await createTransfer(ctx, user, account, provisionsAccount)
            await ctx.repo(Transaction).update({ transferId }, { status: TransactionStatus.PENDING, occurredOn: currentMonthStart })

            const response = await getPending(accessToken)

            expect(response.body.data.map(({ id, transferId }: Transaction) => [id, transferId])).toEqual([[from.id, transferId], [to.id, transferId]])
        })

        it('should not return the pending transactions of other users', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            await createTransaction(ctx, otherUser, otherAccount, { occurredOn: currentMonthStart, status: TransactionStatus.PENDING })

            const response = await getPending(accessToken)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer()).get('/api/v1/transactions/pending')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await getPending('toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)

            const response = await getPending(signAccessToken(ctx, user, -10))

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await getPending(refreshToken)

            expect(response.statusCode).toBe(401)
        })
    })
})
