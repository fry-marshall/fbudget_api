import { INestApplication } from "@nestjs/common"
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AppModule } from "src/app.module";
import { setupApp } from "src/setup-app";
import { ERRORS_MESSAGES } from "src/common/constants";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { Settings } from "src/modules/settings/settings.entity";
import { Currency } from "src/modules/settings/types";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { createUserWithRefreshToken, signAccessToken } from "../helpers";

describe('PUT users/me/settings', () => {
    let app: INestApplication;
    let userRepository: Repository<User>;
    let settingsRepository: Repository<Settings>;
    let refreshTokenRepository: Repository<RefreshToken>;
    let jwtService: JwtService;
    let configService: ConfigService;

    const DEFAULT_SETTINGS = { primaryCurrency: Currency.EUR, monthlyBudget: null }
    const VALID_BODY = { primaryCurrency: Currency.USD, monthlyBudget: 1500 }

    const createUserWithAccessToken = async (authProvider: AuthProvider = AuthProvider.EMAIL) => {
        const { user } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService, authProvider)
        return { user, accessToken: signAccessToken(jwtService, configService, user) }
    }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule]
        }).compile()

        app = moduleRef.createNestApplication()
        setupApp(app)
        userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User))
        settingsRepository = moduleRef.get<Repository<Settings>>(getRepositoryToken(Settings))
        refreshTokenRepository = moduleRef.get<Repository<RefreshToken>>(getRepositoryToken(RefreshToken))
        jwtService = moduleRef.get(JwtService)
        configService = moduleRef.get(ConfigService)

        await app.init()
    })

    beforeEach(async () => {
        await refreshTokenRepository.deleteAll()
        await userRepository.deleteAll()
        await settingsRepository.deleteAll()
    })

    afterAll(async () => {
        await app.close()
    })

    describe('Success cases', () => {
        it('should update all fields and return correct info', async () => {
            const { user, accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({ id: user.settings!.id, ...VALID_BODY })
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(VALID_BODY)
        })

        it.each(Object.values(Currency))('should accept %s as primaryCurrency', async (currency) => {
            const { user, accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, primaryCurrency: currency })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.primaryCurrency).toBe(currency)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject({ primaryCurrency: currency })
        })

        it('should accept 0 as monthlyBudget', async () => {
            const { user, accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, monthlyBudget: 0 })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.monthlyBudget).toBe(0)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject({ monthlyBudget: 0 })
        })

        it('should not expose sensitive fields', async () => {
            const { accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.user).toBeUndefined()
            expect(response.body.data.createdAt).toBeUndefined()
            expect(response.body.data.updatedAt).toBeUndefined()
        })

        it('should only update settings of the current user', async () => {
            const { accessToken } = await createUserWithAccessToken()
            const otherUser = await userRepository.save({
                displayName: 'other',
                email: 'other@gmail.com',
                authProviders: [AuthProvider.EMAIL],
                settings: {}
            })

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
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
            const { user, accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
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
            ['monthlyBudget', true],
            ['monthlyBudget', null],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
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
            const { user, accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(DEFAULT_SETTINGS)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .set('Authorization', 'Bearer toto')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserWithAccessToken()
            const expiredAccessToken = signAccessToken(jwtService, configService, user, -10)

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(DEFAULT_SETTINGS)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(DEFAULT_SETTINGS)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserWithAccessToken()
            await userRepository.delete(user.id!)

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when user is soft deleted', async () => {
            const { user, accessToken } = await createUserWithAccessToken()
            await userRepository.softDelete(user.id!)

            const response = await request(app.getHttpServer())
                .put('/users/me/settings')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await settingsRepository.findOneBy({ id: user.settings!.id })).toMatchObject(DEFAULT_SETTINGS)
        })
    })
})
