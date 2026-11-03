import { CategoryType } from "src/modules/categories/types";
import { TransactionSourceType, TransactionStatus } from "src/modules/transactions/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createFixedCharge, createIncome, createProvision, createSavingsGoal, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET budget/dashboard', () => {
    let ctx: TestContext;

    // Only Date is faked so that the HTTP server and the database keep working, the tokens are signed on this day too
    const TODAY = new Date('2027-03-22T12:00:00Z')

    beforeAll(async () => {
        ctx = await createTestApp()
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
        jest.useFakeTimers({
            now: TODAY,
            doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
        })
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    const getDashboard = (accessToken: string, query = '') => request(ctx.app.getHttpServer())
        .get(`/api/v1/budget/dashboard${query}`)
        .set('Authorization', `Bearer ${accessToken}`)

    /**
     * 248000 - 119600 - 5834 (700 € / 12) - 20000 = 102566 free to live each month
     */
    const createRules = async (user: User) => {
        await createIncome(ctx, user, { amount: 248000, dayOfMonth: 28 })
        await createFixedCharge(ctx, user, { amount: 119600 })
        await createProvision(ctx, user, { totalAmount: 70000, frequencyMonths: 12 })
        await createSavingsGoal(ctx, user, { monthlyContribution: 20000 })
    }

    /**
     * March 2027 expenses of the user: 13830 of groceries (refund included), 7500 of restaurants, 2000 without category, and transactions which must not count
     */
    const createMarchExpenses = async (user: User) => {
        const account = await createAccount(ctx, user)
        const groceries = await createCategory(ctx, user, { type: CategoryType.GROCERIES, envelopeBudget: 20000 })
        const restaurants = await createCategory(ctx, user, { type: CategoryType.RESTAURANTS, envelopeBudget: 6000 })
        const pets = await createCategory(ctx, user, { type: CategoryType.OTHER, label: 'Animaux' })

        for (const amount of [-8640, -4290, -1250, -650, 1000]) {
            await createTransaction(ctx, user, account, { amount, occurredOn: '2027-03-10', categoryId: groceries.id })
        }
        await createTransaction(ctx, user, account, { amount: -4500, occurredOn: '2027-03-01', categoryId: restaurants.id })
        await createTransaction(ctx, user, account, { amount: -3000, occurredOn: '2027-03-31', categoryId: restaurants.id })
        await createTransaction(ctx, user, account, { amount: -2000, occurredOn: '2027-03-15', categoryId: null })
        // Other months
        await createTransaction(ctx, user, account, { amount: -9000, occurredOn: '2027-02-28', categoryId: groceries.id })
        await createTransaction(ctx, user, account, { amount: -9000, occurredOn: '2027-04-01', categoryId: groceries.id })
        // Already in the budget
        await createTransaction(ctx, user, account, { amount: -119600, occurredOn: '2027-03-05', sourceType: TransactionSourceType.FIXED_CHARGE })
        await createTransaction(ctx, user, account, { amount: -9000, occurredOn: '2027-03-05', sourceType: TransactionSourceType.PROVISION, categoryId: pets.id })
        await createTransaction(ctx, user, account, { amount: -5834, occurredOn: '2027-03-01', sourceType: TransactionSourceType.TRANSFER })
        await createTransaction(ctx, user, account, { amount: -20000, occurredOn: '2027-03-28', sourceType: TransactionSourceType.SAVINGS, status: TransactionStatus.PENDING })

        return { groceries, restaurants, pets }
    }

    describe('Success cases', () => {
        it('should compute where the user stands in the month, globally and by category', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createRules(user)
            const { groceries, restaurants, pets } = await createMarchExpenses(user)

            const response = await getDashboard(accessToken, '?month=2027-03')

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                month: '2027-03',
                monthBudget: 102566,
                provisionSmoothing: 5834,
                // 13830 + 7500 + 2000
                spentThisMonth: 23330,
                freeAmount: 79236,
                // 2333000 / 102566 = 22,7
                pacingPct: 22,
                // 23330 / 22 days × 31 days = 32874 spent at this pace
                projectedBalance: 69692,
                daysElapsed: 22,
                daysInMonth: 31,
                categories: [
                    { categoryId: groceries.id, type: CategoryType.GROCERIES, label: null, spent: 13830, envelopeBudget: 20000, pct: 69 },
                    { categoryId: restaurants.id, type: CategoryType.RESTAURANTS, label: null, spent: 7500, envelopeBudget: 6000, pct: 125 },
                    { categoryId: pets.id, type: CategoryType.OTHER, label: 'Animaux', spent: 0, envelopeBudget: null, pct: null },
                ],
            })
        })

        it('should compute the current month by default', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createRules(user)
            await createMarchExpenses(user)

            const response = await getDashboard(accessToken)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ month: '2027-03', spentThisMonth: 23330, daysElapsed: 22 })
        })

        it('should count every day of a past month and project its actual expenses', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createRules(user)
            await createMarchExpenses(user)

            const response = await getDashboard(accessToken, '?month=2027-02')

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ month: '2027-02', spentThisMonth: 9000, freeAmount: 93566, projectedBalance: 93566, daysElapsed: 28, daysInMonth: 28 })
        })

        it('should keep the whole budget for a month not started yet', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createRules(user)

            const response = await getDashboard(accessToken, '?month=2027-05')

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ month: '2027-05', spentThisMonth: 0, freeAmount: 102566, pacingPct: 0, projectedBalance: 102566, daysElapsed: 0 })
        })

        it('should return an empty dashboard for a user without rules nor categories', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await getDashboard(accessToken, '?month=2027-03')

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({ month: '2027-03', monthBudget: 0, provisionSmoothing: 0, spentThisMonth: 0, freeAmount: 0, pacingPct: null, projectedBalance: 0, daysElapsed: 22, daysInMonth: 31, categories: [] })
        })

        it('should not count the rules, the transactions and the categories of other users', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            await createRules(otherUser)
            await createMarchExpenses(otherUser)

            const response = await getDashboard(accessToken, '?month=2027-03')

            expect(response.body.data).toMatchObject({ monthBudget: 0, spentThisMonth: 0, categories: [] })
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['month is 2026-13', '?month=2026-13'],
            ['month is 2026-00', '?month=2026-00'],
            ['month is 2026-1', '?month=2026-1'],
            ['month is a full date', '?month=2026-11-01'],
            ['month is empty', '?month='],
            ['month is sent twice', '?month=2026-11&month=2026-12'],
            ['an unknown parameter is sent', '?month=2026-11&today=2026-11-15'],
        ])('should throw bad request when %s', async (_, query) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await getDashboard(accessToken, query)

            expect(response.statusCode).toBe(400)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer()).get('/api/v1/budget/dashboard')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await getDashboard('toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)

            const response = await getDashboard(signAccessToken(ctx, user, -10))

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await getDashboard(refreshToken)

            expect(response.statusCode).toBe(401)
        })
    })
})
