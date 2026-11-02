import { ProvisionStatus } from "src/modules/provisions/types";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "src/modules/transactions/types";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createProvision, createTransaction, createTransfer, createUserAndLogin, signAccessToken } from "../utils/factories";
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
                    reservedAmount: null,
                    progressPct: null,
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
                    reservedAmount: 0,
                    progressPct: 0,
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

        it('should return the money put aside on the dedicated account: confirmed transfers received minus payments from this account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primary = await createAccount(ctx, user, { isPrimary: true })
            const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions' })
            const provision = await createProvision(ctx, user, { accountId: provisionsAccount.id })
            const otherProvision = await createProvision(ctx, user, { label: 'Coiffeur', accountId: provisionsAccount.id, nextDueDate: '2027-04-01' })
            const transfers = await Promise.all([1, 2, 3].map(() => createTransfer(ctx, user, primary, provisionsAccount, 5834)))
            await ctx.repo(Transaction).update({ transferId: transfers[0].transferId }, { provisionId: provision.id })
            await ctx.repo(Transaction).update({ transferId: transfers[1].transferId }, { provisionId: provision.id })
            // Pending, or for another provision: not counted
            await ctx.repo(Transaction).update({ transferId: transfers[2].transferId }, { provisionId: provision.id, status: TransactionStatus.PENDING })
            const otherTransfer = await createTransfer(ctx, user, primary, provisionsAccount, 3000)
            await ctx.repo(Transaction).update({ transferId: otherTransfer.transferId }, { provisionId: otherProvision.id })
            await createTransaction(ctx, user, provisionsAccount, { amount: -10000, sourceType: TransactionSourceType.PROVISION, provisionId: provision.id })
            // Paid from the primary account: the reserve is untouched
            await createTransaction(ctx, user, primary, { amount: -20000, sourceType: TransactionSourceType.PROVISION, provisionId: provision.id })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data).toEqual([
                expect.objectContaining({ id: provision.id, reservedAmount: 1668, progressPct: 2 }),
                expect.objectContaining({ id: otherProvision.id, reservedAmount: 3000, progressPct: 4 }),
            ])
        })

        it('should return a negative reserve when a payment exceeded it', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions' })
            const provision = await createProvision(ctx, user, { accountId: provisionsAccount.id })
            await createTransaction(ctx, user, provisionsAccount, { amount: -72000, sourceType: TransactionSourceType.PROVISION, provisionId: provision.id })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data[0]).toMatchObject({ reservedAmount: -72000, progressPct: 0 })
        })

        it('should return no reserve for a provision on the primary account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primary = await createAccount(ctx, user, { isPrimary: true })
            const provision = await createProvision(ctx, user, { accountId: primary.id })
            await createTransaction(ctx, user, primary, { amount: -70000, sourceType: TransactionSourceType.PROVISION, provisionId: provision.id })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data[0]).toMatchObject({ reservedAmount: null, progressPct: null })
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
