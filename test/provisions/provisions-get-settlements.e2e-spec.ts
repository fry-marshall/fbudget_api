import { ERRORS_MESSAGES } from "src/common/constants";
import { ProvisionStatus } from "src/modules/provisions/types";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createProvision, createTransaction, createTransfer, createUserAndLogin, signAccessToken } from "../utils/factories";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET provisions/:id/settlements', () => {
    let ctx: TestContext;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

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
        it('should return an empty list when the provision was never settled', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/provisions/${provision.id}/settlements`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the settlements of the provision whatever their month, most recent first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user)
            const otherProvision = await createProvision(ctx, user, { label: 'Coiffeur' })
            const settlementOptions = { sourceType: TransactionSourceType.PROVISION, provisionId: provision.id }
            const old = await createTransaction(ctx, user, account, { ...settlementOptions, amount: -68000, occurredOn: '2025-03-14' })
            const last = await createTransaction(ctx, user, account, { ...settlementOptions, amount: -70000, occurredOn: '2026-03-14' })
            await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.PROVISION, provisionId: otherProvision.id })
            await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/provisions/${provision.id}/settlements`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.map((transaction) => transaction.id)).toEqual([last.id, old.id])
            expect(response.body.data[0]).toMatchObject({ amount: -70000, sourceType: TransactionSourceType.PROVISION, provisionId: provision.id })
        })

        it('should not return the transfers to the provision', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primary = await createAccount(ctx, user, { isPrimary: true })
            const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions' })
            const provision = await createProvision(ctx, user, { accountId: provisionsAccount.id })
            const { transferId } = await createTransfer(ctx, user, primary, provisionsAccount)
            await ctx.repo(Transaction).update({ transferId }, { provisionId: provision.id })
            const payment = await createTransaction(ctx, user, provisionsAccount, { amount: -70000, sourceType: TransactionSourceType.PROVISION, provisionId: provision.id })

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/provisions/${provision.id}/settlements`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((transaction) => transaction.id)).toEqual([payment.id])
        })

        it('should return the settlements of a cancelled provision', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { status: ProvisionStatus.CANCELLED })
            const settlement = await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.PROVISION, provisionId: provision.id })

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/provisions/${provision.id}/settlements`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.map((transaction) => transaction.id)).toEqual([settlement.id])
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/provisions/toto/settlements')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when provision does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/provisions/${UNKNOWN_ID}/settlements`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND)
        })

        it('should throw not found when provision belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const otherProvision = await createProvision(ctx, otherUser)
            await createTransaction(ctx, otherUser, otherAccount, { sourceType: TransactionSourceType.PROVISION, provisionId: otherProvision.id })

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/provisions/${otherProvision.id}/settlements`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/provisions/${UNKNOWN_ID}/settlements`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/provisions/${UNKNOWN_ID}/settlements`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/provisions/${provision.id}/settlements`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/provisions/${provision.id}/settlements`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
