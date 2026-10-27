import { ERRORS_MESSAGES } from "src/common/constants";
import { Settings } from "src/modules/settings/settings.entity";
import { Currency } from "src/modules/settings/types";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT users/me/settings', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let settingsRepository: Repository<Settings>;

    const DEFAULT_SETTINGS = { primaryCurrency: Currency.EUR, monthlyBudget: null }
    const VALID_BODY = { primaryCurrency: Currency.USD, monthlyBudget: 1500 }

    beforeAll(async () => {
        ctx = await createTestApp()
        userRepository = ctx.repo(User)
        settingsRepository = ctx.repo(Settings)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should update all fields and return correct info', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({ id: user.settings!.id, ...VALID_BODY })
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(VALID_BODY)
        })

        it.each(Object.values(Currency))('should accept %s as primaryCurrency', async (currency) => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, primaryCurrency: currency })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.primaryCurrency).toBe(currency)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject({ primaryCurrency: currency })
        })

        it.each([0, 2147483647])('should accept %p as monthlyBudget', async (monthlyBudget) => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, monthlyBudget })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.monthlyBudget).toBe(monthlyBudget)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject({ monthlyBudget })
        })

        it('should not expose sensitive fields', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.user).toBeUndefined()
            expect(response.body.data.createdAt).toBeUndefined()
            expect(response.body.data.updatedAt).toBeUndefined()
        })

        it('should only update settings of the current user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const otherUser = await userRepository.save({
                displayName: 'other',
                email: 'other@gmail.com',
                authProviders: [AuthProvider.EMAIL],
                settings: {}
            })

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(200)
            expect(await settingsRepository.findOneBy({ id: otherUser.settings!.id })).toMatchObject(DEFAULT_SETTINGS)
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['primaryCurrency is missing', { monthlyBudget: 1500 }],
            ['monthlyBudget is missing', { primaryCurrency: Currency.USD }],
            ['body is empty', {}],
        ])('should throw bad request when %s', async (_, body) => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(DEFAULT_SETTINGS)
        })

        it.each([
            ['primaryCurrency', 'gbp'],
            ['primaryCurrency', 'EUR'],
            ['primaryCurrency', 123],
            ['primaryCurrency', ''],
            ['primaryCurrency', null],
            ['monthlyBudget', '1500'],
            ['monthlyBudget', 15.5],
            ['monthlyBudget', -100],
            ['monthlyBudget', 2147483648],
            ['monthlyBudget', true],
            ['monthlyBudget', null],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(DEFAULT_SETTINGS)
        })

        it.each([
            ['id', '00000000-0000-0000-0000-000000000000'],
            ['user', { id: '00000000-0000-0000-0000-000000000000' }],
            ['userId', '00000000-0000-0000-0000-000000000000'],
        ])('should throw bad request when %s is sent', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(DEFAULT_SETTINGS)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', 'Bearer toto')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(DEFAULT_SETTINGS)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(DEFAULT_SETTINGS)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when user has no settings', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await settingsRepository.delete(user.settings!.id!)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.SETTINGS.SETTINGS_NOT_FOUND)
            expect(await settingsRepository.count()).toEqual(0)
            expect(await userRepository.findOneBy({ id: user.id })).not.toBeNull()
        })
    })
})
