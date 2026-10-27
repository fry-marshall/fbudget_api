import { AccountType } from "src/modules/accounts/types";
import { Currency } from "src/modules/settings/types";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { createAccount, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('GET accounts', () => {
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
        it('should return an empty list when user has no account', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toEqual([])
        })

        it('should return the user accounts with all fields, oldest first', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const card = await createAccount(ctx, user, { isPrimary: true, last4: '4782', country: 'FR' })
            const wave = await createAccount(ctx, user, { type: AccountType.MOBILE_MONEY, operator: 'Wave', name: 'Wave', currency: Currency.XOF, initialBalance: 87350, country: 'SN' })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual([
                {
                    id: card.id,
                    type: AccountType.CARD,
                    operator: null,
                    name: 'Visa *4782',
                    last4: '4782',
                    country: 'FR',
                    currency: Currency.EUR,
                    initialBalance: 150000,
                    isPrimary: true,
                    createdAt: card.createdAt!.toISOString(),
                },
                {
                    id: wave.id,
                    type: AccountType.MOBILE_MONEY,
                    operator: 'Wave',
                    name: 'Wave',
                    last4: null,
                    country: 'SN',
                    currency: Currency.XOF,
                    initialBalance: 87350,
                    isPrimary: false,
                    createdAt: wave.createdAt!.toISOString(),
                },
            ])
        })

        it('should not return the accounts of other users', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const account = await createAccount(ctx, user)
            await createAccount(ctx, otherUser, { name: 'Other account' })

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toHaveLength(1)
            expect(response.body.data[0].id).toBe(account.id)
        })

        it('should not expose the user relation', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data[0].userId).toBeUndefined()
            expect(response.body.data[0].user).toBeUndefined()
            expect(response.body.data[0].updatedAt).toBeUndefined()
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/accounts')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/accounts')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/accounts')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/accounts')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })
    })
})
