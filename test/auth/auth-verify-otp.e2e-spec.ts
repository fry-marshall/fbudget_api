import { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AppModule } from "src/app.module";
import { setupApp } from "src/setup-app";
import { ERRORS_MESSAGES } from "src/common/constants";
import { generateOtp } from "src/common/helpers/helpers";
import { MailService } from "src/common/services/mail.service";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { Settings } from "src/modules/settings/settings.entity";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { TEST_EMAIL } from "../helpers";

describe('POST auth/verify-otp', () => {
    let app: INestApplication;
    let mailServiceMocked = {
        sendMail: jest.fn()
    };
    let userRepository: Repository<User>;
    let settingsRepository: Repository<Settings>;
    let refreshTokenRepository: Repository<RefreshToken>;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule]
        })
            .overrideProvider(MailService)
            .useValue(mailServiceMocked)
            .compile()

        app = moduleRef.createNestApplication()
        setupApp(app)
        userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User))
        settingsRepository = moduleRef.get<Repository<Settings>>(getRepositoryToken(Settings))
        refreshTokenRepository = moduleRef.get<Repository<RefreshToken>>(getRepositoryToken(RefreshToken))

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
        it('should return access and refresh tokens when OTP is valid', async () => {
            const userCreated = await userRepository.save({
                displayName: 'marshall',
                email: TEST_EMAIL,
                authProviders: [AuthProvider.EMAIL],
                otpCode: generateOtp(),
                otpExpiresAt: new Date(Date.now() + 100000),
                settings: {}
            });

            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: userCreated.otpCode })

            const userVerified = await userRepository.findOne({ where: { email: TEST_EMAIL } })
            const refreshTokens = await refreshTokenRepository.find({ where: { user: { id: userCreated.id } } })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.accessToken).toEqual(expect.any(String))
            expect(response.body.data.refreshToken).toEqual(expect.any(String))
            expect(userVerified?.otpCode).toBeNull()
            expect(userVerified?.otpExpiresAt).toBeNull()
            expect(refreshTokens).toHaveLength(1)
            expect(refreshTokens[0].token).toBe(response.body.data.refreshToken)
        })
    })

    describe('Failure cases', () => {
        it('should throw not found when user doesn\'t exist', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '123456' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await refreshTokenRepository.count()).toEqual(0)
        })

        it('should throw not found when code is wrong', async () => {
            const userCreated = await userRepository.save({
                displayName: 'marshall',
                email: TEST_EMAIL,
                authProviders: [AuthProvider.EMAIL],
                otpCode: '123456',
                otpExpiresAt: new Date(Date.now() + 100000),
                settings: {}
            });

            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '654321' })

            const userNotVerified = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(userNotVerified?.otpCode).toEqual(userCreated.otpCode)
            expect(await refreshTokenRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when OTP is expired', async () => {
            const userCreated = await userRepository.save({
                displayName: 'marshall',
                email: TEST_EMAIL,
                authProviders: [AuthProvider.EMAIL],
                otpCode: generateOtp(),
                otpExpiresAt: new Date(Date.now() - 1000),
                settings: {}
            });

            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: userCreated.otpCode })

            const userNotVerified = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.EXPIRED_OTP)
            expect(userNotVerified?.otpCode).toEqual(userCreated.otpCode)
            expect(await refreshTokenRepository.count()).toEqual(0)
        })

        it('should throw not found when OTP has already been used', async () => {
            const userCreated = await userRepository.save({
                displayName: 'marshall',
                email: TEST_EMAIL,
                authProviders: [AuthProvider.EMAIL],
                otpCode: generateOtp(),
                otpExpiresAt: new Date(Date.now() + 100000),
                settings: {}
            });

            const firstResponse = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: userCreated.otpCode })

            const secondResponse = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: userCreated.otpCode })

            expect(firstResponse.statusCode).toBe(201)
            expect(secondResponse.statusCode).toBe(404)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await refreshTokenRepository.count()).toEqual(1)
        })

        it('should throw not found when user is only registered with google', async () => {
            await userRepository.save({
                displayName: 'marshall',
                email: TEST_EMAIL,
                authProviders: [AuthProvider.GOOGLE],
                settings: {}
            });

            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '123456' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await refreshTokenRepository.count()).toEqual(0)
        })

        it('should throw invalid request when email is malformed', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: 'toto', code: '123456' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when code is too short', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '12345' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when code is too long', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '1234567' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when code is not numeric', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '12ab56' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when code is not a string', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: 123456 })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when forbidden fields passed', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '123456', password: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when empty body', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/verify-otp')
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })
    })

})
