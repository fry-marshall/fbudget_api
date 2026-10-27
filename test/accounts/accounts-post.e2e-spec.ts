import { ERRORS_MESSAGES } from "src/common/constants";
import { Account } from "src/modules/accounts/account.entity";
import { AccountType } from "src/modules/accounts/types";
import { Currency } from "src/modules/settings/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST accounts', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let accountRepository: Repository<Account>;

    const VALID_BODY = {
        type: AccountType.MOBILE_MONEY,
        operator: 'Wave',
        name: 'Wave perso',
        country: 'SN',
        currency: Currency.XOF,
        initialBalance: 87350,
    }

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
        it('should create the first account as primary and return it', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            const accountCreated = await accountRepository.findOneBy({ userId: user.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({
                id: accountCreated!.id,
                type: AccountType.MOBILE_MONEY,
                operator: 'Wave',
                name: 'Wave perso',
                last4: null,
                country: 'SN',
                currency: Currency.XOF,
                initialBalance: 87350,
                isPrimary: true,
                createdAt: accountCreated!.createdAt!.toISOString(),
            })
            expect(accountCreated).toMatchObject({ ...VALID_BODY, isPrimary: true })
        })

        it('should not make the next accounts primary', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primaryAccount = await createAccount(ctx, user, { isPrimary: true })

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(201)
            expect(response.body.data.isPrimary).toBe(false)
            expect(await accountRepository.findOneBy({ id: primaryAccount.id })).toMatchObject({ isPrimary: true })
        })

        it('should create only one primary account when creating accounts in parallel', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const responses = await Promise.all(Array.from({ length: 5 }, () => request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)
            ))

            expect(responses.map((response) => response.statusCode)).toEqual([201, 201, 201, 201, 201])
            expect(await accountRepository.countBy({ userId: user.id })).toEqual(5)
            expect(await accountRepository.countBy({ userId: user.id, isPrimary: true })).toEqual(1)
        })

        it('should create a card account with only the required fields', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ type: AccountType.CARD, name: 'Visa', currency: Currency.EUR, initialBalance: 0 })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({ operator: null, last4: null, country: null, initialBalance: 0 })
        })

        it.each(Object.values(AccountType))('should accept %s as type', async (type) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, type })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.type).toBe(type)
        })

        it.each([-2147483647, -5000, 2147483647])('should accept %p as initialBalance', async (initialBalance) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, initialBalance })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.initialBalance).toBe(initialBalance)
        })

        it('should accept a card with its last 4 digits', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, type: AccountType.CARD, last4: '0042' })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.last4).toBe('0042')
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['type', undefined],
            ['name', undefined],
            ['currency', undefined],
            ['initialBalance', undefined],
            ['type', 'wallet'],
            ['type', null],
            ['name', ''],
            ['name', 123],
            ['name', null],
            ['operator', ''],
            ['operator', 123],
            ['last4', '123'],
            ['last4', '12345'],
            ['last4', 'abcd'],
            ['last4', 4782],
            ['country', 'FRA'],
            ['country', 'XX'],
            ['country', 'sn'],
            ['currency', 'usd'],
            ['currency', 'EUR'],
            ['currency', null],
            ['initialBalance', '1500'],
            ['initialBalance', 15.5],
            ['initialBalance', 2147483648],
            ['initialBalance', -2147483648],
            ['initialBalance', null],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await accountRepository.countBy({ userId: user.id })).toEqual(0)
        })

        it.each([
            ['isPrimary', true],
            ['userId', '00000000-0000-0000-0000-000000000000'],
            ['id', '00000000-0000-0000-0000-000000000000'],
            ['syncStatus', 'synced'],
        ])('should throw bad request when %s is sent', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await accountRepository.count()).toEqual(0)
            expect(await userRepository.countBy({ id: user.id })).toEqual(1)
        })

        it('should throw bad request when body is empty', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', 'Bearer toto')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.count()).toEqual(0)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/accounts')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await accountRepository.count()).toEqual(0)
        })
    })
})
