import { InstallmentPlanStatus } from "src/modules/installment-plans/types";
import { ProvisionStatus } from "src/modules/provisions/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createFixedCharge, createIncome, createInstallmentPlan, createProvision, createSavingsGoal, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET budget/summary', () => {
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

    const getSummary = (accessToken: string, query = '') => request(ctx.app.getHttpServer())
        .get(`/api/v1/budget/summary${query}`)
        .set('Authorization', `Bearer ${accessToken}`)

    /**
     * The onboarding recap of the mockups (CALCULATIONS §3), with rules which must not count
     */
    const createRecapRules = async (user: User) => {
        await createIncome(ctx, user, { amount: 248000, dayOfMonth: 28 })
        await createFixedCharge(ctx, user, { label: 'Loyer', amount: 85000 })
        await createFixedCharge(ctx, user, { label: 'Charges et abonnements', amount: 34600 })
        await createProvision(ctx, user, { label: 'Théâtre', totalAmount: 12000, frequencyMonths: 3 })
        await createProvision(ctx, user, { label: 'Coiffeur', totalAmount: 6000, frequencyMonths: 2 })
        await createProvision(ctx, user, { label: 'Assurance auto', totalAmount: 70000, frequencyMonths: 12 })
        await createProvision(ctx, user, { label: 'Dentiste', totalAmount: 15000, frequencyMonths: 6 })
        await createProvision(ctx, user, { label: 'Ostéo', totalAmount: 9000, frequencyMonths: 3, status: ProvisionStatus.PAUSED })
        await createProvision(ctx, user, { label: 'Salle de sport', totalAmount: 30000, frequencyMonths: 12, status: ProvisionStatus.CANCELLED })
        // 4 × 187,50 € from 2026-11-15, 10 × 89 € from 2026-10-10
        await createInstallmentPlan(ctx, user, { label: 'iPhone 15', totalAmount: 75000, installmentCount: 4, firstDueDate: '2026-11-15' })
        await createInstallmentPlan(ctx, user, { label: 'Canapé', totalAmount: 89000, installmentCount: 10, firstDueDate: '2026-10-10' })
        await createInstallmentPlan(ctx, user, { label: 'Télé', totalAmount: 40000, installmentCount: 4, firstDueDate: '2026-11-20', status: InstallmentPlanStatus.CANCELLED })
        await createSavingsGoal(ctx, user, { monthlyContribution: 20000 })
    }

    describe('Success cases', () => {
        it('should compute what is really free to live in the month', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createRecapRules(user)

            const response = await getSummary(accessToken, '?month=2026-11')

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                month: '2026-11',
                daysInMonth: 30,
                monthlyIncome: 248000,
                fixedCharges: 119600,
                // 4000 + 3000 + 5834 + 2500, the paused and cancelled provisions are not smoothed
                provisionSmoothing: 15334,
                // 18750 + 8900, nothing for the cancelled plan
                installmentsDueThisMonth: 27650,
                savingsContribution: 20000,
                freeAmount: 65416,
                perDay: 2180,
            })
        })

        it('should only count the installments due in the requested month', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createRecapRules(user)

            const response = await getSummary(accessToken, '?month=2027-03')

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ month: '2027-03', daysInMonth: 31, installmentsDueThisMonth: 8900, freeAmount: 84166, perDay: 2715 })
        })

        it('should compute the current month by default', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createIncome(ctx, user, { amount: 248000 })
            const currentMonth = new Date().toISOString().slice(0, 7)

            const response = await getSummary(accessToken)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ month: currentMonth, monthlyIncome: 248000, freeAmount: 248000 })
        })

        it('should return an empty budget for a user without rules', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await getSummary(accessToken, '?month=2026-11')

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({ month: '2026-11', daysInMonth: 30, monthlyIncome: 0, fixedCharges: 0, provisionSmoothing: 0, installmentsDueThisMonth: 0, savingsContribution: 0, freeAmount: 0, perDay: 0 })
        })

        it('should return a negative budget when the commitments exceed the incomes', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createIncome(ctx, user, { amount: 100000 })
            await createFixedCharge(ctx, user, { amount: 130000 })

            const response = await getSummary(accessToken, '?month=2026-11')

            expect(response.body.data).toMatchObject({ freeAmount: -30000, perDay: -1000 })
        })

        it('should not count the rules of other users', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            await createRecapRules(otherUser)

            const response = await getSummary(accessToken, '?month=2026-11')

            expect(response.body.data).toMatchObject({ monthlyIncome: 0, fixedCharges: 0, provisionSmoothing: 0, installmentsDueThisMonth: 0, savingsContribution: 0, freeAmount: 0 })
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
            ['an unknown parameter is sent', '?month=2026-11&userId=00000000-0000-0000-0000-000000000000'],
        ])('should throw bad request when %s', async (_, query) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await getSummary(accessToken, query)

            expect(response.statusCode).toBe(400)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer()).get('/api/v1/budget/summary')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await getSummary('toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)

            const response = await getSummary(signAccessToken(ctx, user, -10))

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await getSummary(refreshToken)

            expect(response.statusCode).toBe(401)
        })
    })
})
