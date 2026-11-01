import { ERRORS_MESSAGES } from "src/common/constants";
import { Account } from "src/modules/accounts/account.entity";
import { AccountType } from "src/modules/accounts/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT accounts/:id', () => {
    let ctx: TestContext;
    let accountRepository: Repository<Account>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const ACCOUNT_DEFAULTS = { type: AccountType.CARD, operator: null, name: 'Visa *4782', last4: null, country: null, initialBalance: 150000 }

    beforeAll(async () => {
        ctx = await createTestApp()
        accountRepository = ctx.repo(Account)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should update all fields and return the account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { isPrimary: true })
            const body = { type: AccountType.BANK, operator: 'CIC', name: 'Compte courant', last4: '1234', country: 'FR', initialBalance: -2500 }

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                id: account.id,
                ...body,
                isPrimary: true,
                monthlyFunding: null,
                monthlyFundingDay: null,
                createdAt: account.createdAt!.toISOString(),
            })
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject({ ...body, isPrimary: true })
        })

        it.each([
            ['type', AccountType.CASH],
            ['operator', 'Orange Money'],
            ['name', 'Carte pro'],
            ['last4', '9999'],
            ['country', 'SN'],
            ['initialBalance', 0],
        ])('should only update %s', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...ACCOUNT_DEFAULTS, [field]: value })
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject({ ...ACCOUNT_DEFAULTS, [field]: value })
        })

        it('should leave the account unchanged when body is empty', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject(ACCOUNT_DEFAULTS)
        })

        it('should not update the other accounts', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const otherAccount = await createAccount(ctx, user, { name: 'Other account' })

            await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ name: 'Renamed' })

            expect(await accountRepository.findOneBy({ id: otherAccount.id })).toMatchObject({ name: 'Other account' })
        })
    })

    describe('Monthly funding', () => {
        it('should set then stop the monthly funding of an account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createAccount(ctx, user, { isPrimary: true })
            const account = await createAccount(ctx, user, { name: 'Dépenses courantes' })

            const setResponse = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ monthlyFunding: 60000, monthlyFundingDay: 28 })
            const stopResponse = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ monthlyFunding: null, monthlyFundingDay: null })

            expect(setResponse.statusCode).toBe(200)
            expect(setResponse.body.data).toMatchObject({ monthlyFunding: 60000, monthlyFundingDay: 28 })
            expect(stopResponse.statusCode).toBe(200)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject({ monthlyFunding: null, monthlyFundingDay: null })
        })

        it('should throw bad request when the primary account gets a monthly funding', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primaryAccount = await createAccount(ctx, user, { isPrimary: true })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${primaryAccount.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ monthlyFunding: 60000 })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.PRIMARY_ACCOUNT_FUNDING)
            expect(await accountRepository.findOneBy({ id: primaryAccount.id })).toMatchObject({ monthlyFunding: null })
        })

        it.each([
            ['the funding is removed but its day is kept', { monthlyFunding: 60000, monthlyFundingDay: 28 }, { monthlyFunding: null }],
            ['a funding day is set without funding amount', {}, { monthlyFundingDay: 28 }],
        ])('should throw bad request when %s', async (_, initial, body) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createAccount(ctx, user, { isPrimary: true })
            const account = await createAccount(ctx, user, { name: 'Dépenses courantes', ...initial })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.MONTHLY_FUNDING_REQUIRED)
        })

        it.each([
            ['monthlyFunding', 0],
            ['monthlyFunding', 600.5],
            ['monthlyFundingDay', 32],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await createAccount(ctx, user, { isPrimary: true })
            const account = await createAccount(ctx, user, { name: 'Dépenses courantes' })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ monthlyFunding: 60000, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['type', 'wallet'],
            ['type', null],
            ['operator', ''],
            ['operator', null],
            ['name', ''],
            ['name', null],
            ['last4', '123'],
            ['last4', null],
            ['country', 'sn'],
            ['country', 'XX'],
            ['country', null],
            ['initialBalance', 15.5],
            ['initialBalance', 2147483648],
            ['initialBalance', null],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject(ACCOUNT_DEFAULTS)
        })

        it.each([
            ['currency', 'xof'],
            ['isPrimary', true],
            ['userId', '00000000-0000-0000-0000-000000000000'],
            ['id', '00000000-0000-0000-0000-000000000000'],
        ])('should throw bad request when %s is sent', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ name: 'Renamed', [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject({ ...ACCOUNT_DEFAULTS, isPrimary: false, userId: user.id })
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/accounts/toto')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ name: 'Renamed' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when account does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ name: 'Renamed' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        })

        it('should throw not found and keep the account when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${otherAccount.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ name: 'Renamed' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await accountRepository.findOneBy({ id: otherAccount.id })).toMatchObject(ACCOUNT_DEFAULTS)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .send({ name: 'Renamed' })

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject(ACCOUNT_DEFAULTS)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')
                .send({ name: 'Renamed' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send({ name: 'Renamed' })

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject(ACCOUNT_DEFAULTS)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send({ name: 'Renamed' })

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.findOneBy({ id: account.id })).toMatchObject(ACCOUNT_DEFAULTS)
        })
    })
})
