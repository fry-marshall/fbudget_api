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

describe('GET users/me', () => {
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
        it.each([AuthProvider.EMAIL, AuthProvider.GOOGLE])('should return correct info when user create with %s', async (authProvider) => {
            const { user, accessToken } = await createUserWithAccessToken(authProvider)

            const response = await request(app.getHttpServer())
                .get('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                id: user.id,
                email: TEST_EMAIL,
                displayName: 'marshall',
                city: null,
                country: null,
                plan: SubscriptionPlan.FREE,
                role: UserRole.USER,
                settings: {
                    id: user.settings!.id,
                    primaryCurrency: Currency.EUR,
                    monthlyBudget: null,
                },
                createdAt: user.createdAt!.toISOString()
            })
        })

        it('should not expose sensitive fields', async () => {
            const { user, accessToken } = await createUserWithAccessToken()
            await userRepository.update(user.id!, { otpCode: '123456', otpExpiresAt: new Date() })

            const response = await request(app.getHttpServer())
                .get('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.otpCode).toBeUndefined()
            expect(response.body.data.otpExpiresAt).toBeUndefined()
            expect(response.body.data.refreshTokens).toBeUndefined()
            expect(response.body.data.updatedAt).toBeUndefined()
            expect(response.body.data.deletedAt).toBeUndefined()
        })

        it('should return updated settings', async () => {
            const { user, accessToken } = await createUserWithAccessToken()
            await settingsRepository.update(user.settings!.id!, { primaryCurrency: Currency.USD, monthlyBudget: 1500 })

            const response = await request(app.getHttpServer())
                .get('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.settings).toStrictEqual({
                id: user.settings!.id,
                primaryCurrency: Currency.USD,
                monthlyBudget: 1500,
            })
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(app.getHttpServer())
                .get('/users/me')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(app.getHttpServer())
                .get('/users/me')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserWithAccessToken()
            const expiredAccessToken = signAccessToken(jwtService, configService, user, -10)

            const response = await request(app.getHttpServer())
                .get('/users/me')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)

            const response = await request(app.getHttpServer())
                .get('/users/me')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserWithAccessToken()
            await userRepository.delete(user.id!)

            const response = await request(app.getHttpServer())
                .get('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when user is soft deleted', async () => {
            const { user, accessToken } = await createUserWithAccessToken()
            await userRepository.softDelete(user.id!)

            const response = await request(app.getHttpServer())
                .get('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })
    })
})
