import { ProvisionStatus } from "src/modules/provisions/types";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createProvision, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET provisions', () => {
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
        it('should return an empty list when user has no provision', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the provisions with all fields, next due date first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const insurance = await createProvision(ctx, user, { accountId: account.id, categoryId: category.id })
            const hairdresser = await createProvision(ctx, user, { label: 'Coiffeur', totalAmount: 6000, frequencyMonths: 2, nextDueDate: '2026-12-10' })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual([
                {
                    id: hairdresser.id,
                    label: 'Coiffeur',
                    totalAmount: 6000,
                    frequencyMonths: 2,
                    monthlyAmount: 3000,
                    nextDueDate: '2026-12-10',
                    startedAt: '2026-11-01',
                    status: ProvisionStatus.ACTIVE,
                    accountId: null,
                    categoryId: null,
                    createdAt: hairdresser.createdAt!.toISOString(),
                },
                {
                    id: insurance.id,
                    label: 'Assurance auto',
                    totalAmount: 70000,
                    frequencyMonths: 12,
                    monthlyAmount: 5834,
                    nextDueDate: '2027-03-15',
                    startedAt: '2026-11-01',
                    status: ProvisionStatus.ACTIVE,
                    accountId: account.id,
                    categoryId: category.id,
                    createdAt: insurance.createdAt!.toISOString(),
                },
            ])
        })

        it.each([
            [70000, 12, 5834],
            [12000, 3, 4000],
            [15000, 6, 2500],
            [1, 60, 1],
            [100000, 3, 33334],
        ])('should round up the monthly amount of %p every %p months to %p', async (totalAmount, frequencyMonths, monthlyAmount) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createProvision(ctx, user, { totalAmount, frequencyMonths })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data[0].monthlyAmount).toBe(monthlyAmount)
        })

        it('should return the paused provisions and hide the cancelled ones', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const paused = await createProvision(ctx, user, { status: ProvisionStatus.PAUSED })
            await createProvision(ctx, user, { status: ProvisionStatus.CANCELLED })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((provision) => provision.id)).toEqual([paused.id])
        })

        it('should not return the provisions of other users', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const provision = await createProvision(ctx, user)
            await createProvision(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((provision) => provision.id)).toEqual([provision.id])
        })

        it('should not expose the user relation', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data[0].userId).toBeUndefined()
            expect(response.body.data[0].user).toBeUndefined()
            expect(response.body.data[0].updatedAt).toBeUndefined()
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
