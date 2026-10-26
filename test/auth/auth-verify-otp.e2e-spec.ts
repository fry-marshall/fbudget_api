import { ERRORS_MESSAGES } from "src/common/constants";
import { generateOtp, getTokenExpiry } from "src/common/helpers/helpers";
import { MailService } from "src/common/services/mail.service";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { TEST_EMAIL } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST auth/verify-otp', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let refreshTokenRepository: Repository<RefreshToken>;

    const mailServiceMocked = {
        sendMail: jest.fn()
    }

    beforeAll(async () => {
        ctx = await createTestApp([
            { provider: MailService, useValue: mailServiceMocked }
        ])
        userRepository = ctx.repo(User)
        refreshTokenRepository = ctx.repo(RefreshToken)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
        jest.clearAllMocks()
    })

    afterAll(async () => {
        await ctx.app.close()
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

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
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
            expect(refreshTokens[0].expiresAt).toEqual(getTokenExpiry(ctx.jwtService, response.body.data.refreshToken))
            expect(refreshTokens[0].expiresAt!.getTime()).toBeGreaterThan(Date.now())
        })
    })

    describe('Failure cases', () => {
        it('should throw not found when user doesn\'t exist', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
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

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
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

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
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

            const firstResponse = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: userCreated.otpCode })

            const secondResponse = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
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

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '123456' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await refreshTokenRepository.count()).toEqual(0)
        })

        it('should throw invalid request when email is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
                .send({ email: 'toto', code: '123456' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when code is too short', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '12345' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when code is too long', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '1234567' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when code is not numeric', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '12ab56' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when code is not a string', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: 123456 })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when forbidden fields passed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
                .send({ email: TEST_EMAIL, code: '123456', password: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when empty body', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })
    })

})
