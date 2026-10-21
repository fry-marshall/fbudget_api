import { INestApplication, ValidationPipe } from "@nestjs/common"
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AppModule } from "src/app.module";
import { ERRORS_MESSAGES } from "src/common/constants";
import { GlobalExceptionFilter } from "src/common/filters/global-exception.filter";
import { ResponseInterceptor } from "src/common/interceptors/response.interceptor";
import { MailService } from "src/common/services/mail.service";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { Settings } from "src/modules/settings/settings.entity";
import { User } from "src/modules/users/user.entity";
import { randomUUID } from "crypto";
import request from 'supertest';
import { Repository } from "typeorm";
import { createUserWithRefreshToken } from "../helpers";

describe('POST auth/logout', () => {
    let app: INestApplication;
    let mailServiceMocked = {
        sendMail: jest.fn()
    };
    let userRepository: Repository<User>;
    let settingsRepository: Repository<Settings>;
    let refreshTokenRepository: Repository<RefreshToken>;
    let jwtService: JwtService;
    let configService: ConfigService;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule]
        })
            .overrideProvider(MailService)
            .useValue(mailServiceMocked)
            .compile()

        app = moduleRef.createNestApplication()
        app.useGlobalInterceptors(new ResponseInterceptor())
        app.useGlobalFilters(new GlobalExceptionFilter())
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
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
        jest.clearAllMocks()
    })

    afterAll(async () => {
        await app.close()
    })

    describe('Success cases', () => {
        it('should logout and remove the refresh token from database', async () => {
            const { refreshToken } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)

            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({ message: 'User logout successfully' })
            expect(await refreshTokenRepository.count()).toEqual(0)
        })

        it('should keep the other refresh tokens of the user', async () => {
            const { user, refreshToken } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)
            const otherDeviceRefreshToken = jwtService.sign(
                { id: user.id, email: user.email, jti: randomUUID() },
                { secret: configService.get('REFRESH_TOKEN_SECRET'), expiresIn: configService.get('REFRESH_TOKEN_EXPIRY') }
            )
            await refreshTokenRepository.save({ token: otherDeviceRefreshToken, user: { id: user.id } })

            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken })

            const refreshTokens = await refreshTokenRepository.find({ where: { user: { id: user.id } } })

            expect(response.statusCode).toBe(201)
            expect(refreshTokens).toHaveLength(1)
            expect(refreshTokens[0].token).toBe(otherDeviceRefreshToken)
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when refresh token is malformed', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken: 'toto' })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.INVALID_TOKEN)
        })

        it('should throw unauthorized when refresh token is signed with another secret', async () => {
            const { user } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)
            const accessToken = jwtService.sign(
                { id: user.id, email: user.email },
                { secret: configService.get('ACCESS_TOKEN_SECRET'), expiresIn: configService.get('ACCESS_TOKEN_EXPIRY') }
            )

            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken: accessToken })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.INVALID_TOKEN)
            expect(await refreshTokenRepository.count()).toEqual(1)
        })

        it('should throw unauthorized when refresh token is expired', async () => {
            const { user } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)
            const expiredRefreshToken = jwtService.sign(
                { id: user.id, email: user.email },
                { secret: configService.get('REFRESH_TOKEN_SECRET'), expiresIn: -10 }
            )
            await refreshTokenRepository.save({ token: expiredRefreshToken, user: { id: user.id } })

            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken: expiredRefreshToken })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.INVALID_TOKEN)
            expect(await refreshTokenRepository.count()).toEqual(2)
        })

        it('should throw unauthorized when refresh token is not stored in database', async () => {
            const { refreshToken } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)
            await refreshTokenRepository.deleteAll()

            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND)
        })

        it('should throw unauthorized when user is already logged out', async () => {
            const { refreshToken } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)

            const firstResponse = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken })

            const secondResponse = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken })

            expect(firstResponse.statusCode).toBe(201)
            expect(secondResponse.statusCode).toBe(401)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, refreshToken } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)
            await userRepository.delete(user.id!)

            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw invalid request when refresh token is not a string', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken: 123456 })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when refresh token is empty', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken: '' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when forbidden fields passed', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({ refreshToken: 'toto', password: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when empty body', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/logout')
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })
    })
})
