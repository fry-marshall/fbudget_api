import { ERRORS_MESSAGES } from "src/common/constants";
import { MailService } from "src/common/services/mail.service";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { User } from "src/modules/users/user.entity";
import { randomUUID } from "crypto";
import request from 'supertest';
import { Repository } from "typeorm";
import { getTokenExpiry } from "src/common/helpers/helpers";
import { resetDatabase } from "../utils/database";
import { createUserAndLogin, signAccessToken, signRefreshToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST auth/logout', () => {
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
        it('should logout and remove the refresh token from database', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({ message: 'User logout successfully' })
            expect(await refreshTokenRepository.count()).toEqual(0)
        })

        it('should keep the other refresh tokens of the user', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const otherDeviceRefreshToken = ctx.jwtService.sign(
                { id: user.id, email: user.email, jti: randomUUID() },
                { secret: ctx.configService.get('REFRESH_TOKEN_SECRET'), expiresIn: ctx.configService.get('REFRESH_TOKEN_EXPIRY') }
            )
            await refreshTokenRepository.save({ token: otherDeviceRefreshToken, expiresAt: getTokenExpiry(ctx.jwtService, otherDeviceRefreshToken), user: { id: user.id } })

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken })

            const refreshTokens = await refreshTokenRepository.find({ where: { user: { id: user.id } } })

            expect(response.statusCode).toBe(201)
            expect(refreshTokens).toHaveLength(1)
            expect(refreshTokens[0].token).toBe(otherDeviceRefreshToken)
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when refresh token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken: 'toto' })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.INVALID_TOKEN)
        })

        it('should throw unauthorized when refresh token is signed with another secret', async () => {
            const { user } = await createUserAndLogin(ctx)
            const accessToken = signAccessToken(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken: accessToken })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.INVALID_TOKEN)
            expect(await refreshTokenRepository.count()).toEqual(1)
        })

        it('should throw unauthorized when refresh token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredRefreshToken = signRefreshToken(ctx, user, -10)
            await refreshTokenRepository.save({ token: expiredRefreshToken, expiresAt: getTokenExpiry(ctx.jwtService, expiredRefreshToken), user: { id: user.id } })

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken: expiredRefreshToken })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.INVALID_TOKEN)
            expect(await refreshTokenRepository.count()).toEqual(2)
        })

        it('should throw unauthorized when refresh token is not stored in database', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)
            await refreshTokenRepository.deleteAll()

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND)
        })

        it('should throw unauthorized when user is already logged out', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const firstResponse = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken })

            const secondResponse = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken })

            expect(firstResponse.statusCode).toBe(201)
            expect(secondResponse.statusCode).toBe(401)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw invalid request when refresh token is not a string', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken: 123456 })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when refresh token is empty', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken: '' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when forbidden fields passed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken: 'toto', password: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when empty body', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })
    })
})
