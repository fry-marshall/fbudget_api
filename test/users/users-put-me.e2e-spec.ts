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
import { AuthProvider, SubscriptionPlan, UserRole } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { createUserWithRefreshToken, signAccessToken, TEST_EMAIL } from "../helpers";

describe('PUT users/me', () => {
    let app: INestApplication;
    let userRepository: Repository<User>;
    let settingsRepository: Repository<Settings>;
    let refreshTokenRepository: Repository<RefreshToken>;
    let jwtService: JwtService;
    let configService: ConfigService;

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
        it.each([
            ['displayName', 'toto'],
            ['city', 'Paris'],
            ['country', 'France'],
        ])('should update only %s', async (field, value) => {
            const { user, accessToken } = await createUserWithAccessToken()
            await userRepository.update(user.id!, { city: 'Lyon', country: 'Italie' })
            const expected = { displayName: 'marshall', city: 'Lyon', country: 'Italie', [field]: value }

            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject(expected)
            expect(await userRepository.findOneBy({ id: user.id })).toMatchObject(expected)
        })

        it('should update all fields and return correct info', async () => {
            const { user, accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ displayName: 'toto', city: 'Paris', country: 'France' })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                id: user.id,
                email: TEST_EMAIL,
                displayName: 'toto',
                city: 'Paris',
                country: 'France',
                plan: SubscriptionPlan.FREE,
                role: UserRole.USER,
                settings: {
                    id: user.settings!.id,
                    primaryCurrency: Currency.EUR,
                    monthlyBudget: null,
                },
                createdAt: user.createdAt!.toISOString()
            })
            expect(await userRepository.findOneBy({ id: user.id })).toMatchObject({ displayName: 'toto', city: 'Paris', country: 'France' })
        })

        it('should leave user unchanged when body is empty', async () => {
            const { accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({
                displayName: 'marshall',
                city: null,
                country: null,
            })
        })

        it('should not expose sensitive fields', async () => {
            const { user, accessToken } = await createUserWithAccessToken()
            await userRepository.update(user.id!, { otpCode: '123456', otpExpiresAt: new Date() })

            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ displayName: 'toto' })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.otpCode).toBeUndefined()
            expect(response.body.data.otpExpiresAt).toBeUndefined()
            expect(response.body.data.refreshTokens).toBeUndefined()
            expect(response.body.data.updatedAt).toBeUndefined()
            expect(response.body.data.deletedAt).toBeUndefined()
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['displayName', 123],
            ['city', true],
            ['country', ['France']],
            ['displayName', ''],
            ['city', ''],
            ['country', ''],
            ['displayName', null],
            ['city', null],
            ['country', null],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await userRepository.findOneBy({ id: user.id })).toMatchObject({ displayName: 'marshall', city: null, country: null })
        })

        it.each([
            ['email', 'hacker@gmail.com'],
            ['plan', 'premium'],
            ['role', UserRole.ADMIN],
            ['otpCode', '123456'],
        ])('should throw bad request when %s is sent', async (field, value) => {
            const { user, accessToken } = await createUserWithAccessToken()

            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ displayName: 'toto', [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await userRepository.findOneBy({ id: user.id })).toMatchObject({
                displayName: 'marshall',
                email: TEST_EMAIL,
                plan: SubscriptionPlan.FREE,
                role: UserRole.USER,
                otpCode: null,
            })
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(app.getHttpServer())
                .put('/users/me')
                .send({ displayName: 'toto' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', 'Bearer toto')
                .send({ displayName: 'toto' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserWithAccessToken()
            const expiredAccessToken = signAccessToken(jwtService, configService, user, -10)

            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send({ displayName: 'toto' })

            expect(response.statusCode).toBe(401)
            expect(await userRepository.findOneBy({ id: user.id })).toMatchObject({ displayName: 'marshall' })
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)

            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send({ displayName: 'toto' })

            expect(response.statusCode).toBe(401)
            expect(await userRepository.findOneBy({ id: user.id })).toMatchObject({ displayName: 'marshall' })
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserWithAccessToken()
            await userRepository.delete(user.id!)

            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ displayName: 'toto' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when user is soft deleted', async () => {
            const { user, accessToken } = await createUserWithAccessToken()
            await userRepository.softDelete(user.id!)

            const response = await request(app.getHttpServer())
                .put('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ displayName: 'toto' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await userRepository.findOne({ where: { id: user.id }, withDeleted: true })).toMatchObject({ displayName: 'marshall' })
        })
    })
})
