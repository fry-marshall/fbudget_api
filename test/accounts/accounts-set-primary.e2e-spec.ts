import { ERRORS_MESSAGES } from "src/common/constants";
import { Account } from "src/modules/accounts/account.entity";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT accounts/:id/set-primary', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let accountRepository: Repository<Account>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

    beforeAll(async () => {
        ctx = await createTestApp()
        userRepository = ctx.repo(User)
        accountRepository = ctx.repo(Account)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should drop the monthly funding of the account becoming primary', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createAccount(ctx, user, { isPrimary: true })
            const account = await createAccount(ctx, user, { name: 'Dépenses courantes', monthlyFunding: 60000, monthlyFundingDay: 28 })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}/set-primary`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ isPrimary: true, monthlyFunding: null, monthlyFundingDay: null })
        })

        it('should make the account primary and unset the previous primary account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primaryAccount = await createAccount(ctx, user, { isPrimary: true })
            const account = await createAccount(ctx, user, { name: 'Wave' })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}/set-primary`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ id: account.id, name: 'Wave', isPrimary: true })
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject({ isPrimary: true })
            expect(await accountRepository.findOneBy({ id: primaryAccount.id })).toMatchObject({ isPrimary: false })
        })

        it('should keep the account primary when it is already primary', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primaryAccount = await createAccount(ctx, user, { isPrimary: true })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${primaryAccount.id}/set-primary`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.isPrimary).toBe(true)
            expect(await accountRepository.countBy({ userId: user.id, isPrimary: true })).toEqual(1)
        })

        it('should make the account primary when the user has no primary account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}/set-primary`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject({ isPrimary: true })
        })

        it('should not change the primary account of other users', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const account = await createAccount(ctx, user)
            const otherPrimaryAccount = await createAccount(ctx, otherUser, { isPrimary: true })

            await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}/set-primary`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(await accountRepository.findOneBy({ id: otherPrimaryAccount.id })).toMatchObject({ isPrimary: true })
        })

        it('should keep exactly one primary account when setting primary accounts in parallel', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createAccount(ctx, user, { isPrimary: true })
            const accounts = await Promise.all(Array.from({ length: 4 }, (_, index) => createAccount(ctx, user, { name: `Account ${index}` })))

            const responses = await Promise.all(accounts.map((account) => request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}/set-primary`)
                .set('Authorization', `Bearer ${accessToken}`)
            ))

            expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200])
            expect(await accountRepository.countBy({ userId: user.id, isPrimary: true })).toEqual(1)
        })

        it('should ignore the body and make the account primary', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}/set-primary`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ isPrimary: false })

            expect(response.statusCode).toBe(200)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject({ isPrimary: true })
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/accounts/toto/set-primary')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found and keep the primary account when account does not exist', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primaryAccount = await createAccount(ctx, user, { isPrimary: true })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${UNKNOWN_ID}/set-primary`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await accountRepository.findOneBy({ id: primaryAccount.id })).toMatchObject({ isPrimary: true })
        })

        it('should throw not found and change nothing when account belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const primaryAccount = await createAccount(ctx, user, { isPrimary: true })
            const otherAccount = await createAccount(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${otherAccount.id}/set-primary`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await accountRepository.findOneBy({ id: primaryAccount.id })).toMatchObject({ isPrimary: true })
            expect(await accountRepository.findOneBy({ id: otherAccount.id })).toMatchObject({ isPrimary: false })
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}/set-primary`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}/set-primary`)

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject({ isPrimary: false })
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${UNKNOWN_ID}/set-primary`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}/set-primary`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject({ isPrimary: false })
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}/set-primary`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject({ isPrimary: false })
        })
    })
})
