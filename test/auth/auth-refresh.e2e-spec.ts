import { ERRORS_MESSAGES } from "src/common/constants";
import { MailService } from "src/common/services/mail.service";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { getTokenExpiry } from "src/common/helpers/helpers";
import { User } from "src/modules/users/user.entity";
import { resetDatabase } from "../utils/database";
import { createUserAndLogin, signAccessToken, signRefreshToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST auth/refresh', () => {
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
        it('should return new access and refresh tokens when refresh token is valid', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.accessToken).toEqual(expect.any(String))
            expect(response.body.data.refreshToken).toEqual(expect.any(String))
        })

        it('should replace the old refresh token by the new one in database', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken })

            const refreshTokens = await refreshTokenRepository.find({ where: { user: { id: user.id } } })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.refreshToken).not.toBe(refreshToken)
            expect(refreshTokens).toHaveLength(1)
            expect(refreshTokens[0].token).toBe(response.body.data.refreshToken)
            expect(refreshTokens[0].expiresAt).toEqual(getTokenExpiry(ctx.jwtService, response.body.data.refreshToken))
            expect(refreshTokens[0].expiresAt!.getTime()).toBeGreaterThan(Date.now())
        })

        it('should reject the old refresh token once it has been rotated', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const firstResponse = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken })

            const secondResponse = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken })

            expect(firstResponse.statusCode).toBe(201)
            expect(secondResponse.statusCode).toBe(401)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND)
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when refresh token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken: 'toto' })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.INVALID_TOKEN)
        })

        it('should throw unauthorized when refresh token is signed with another secret', async () => {
            const { user } = await createUserAndLogin(ctx)
            const accessToken = signAccessToken(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
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
                .post('/api/v1/auth/refresh')
                .send({ refreshToken: expiredRefreshToken })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.INVALID_TOKEN)
            expect(await refreshTokenRepository.count()).toEqual(2)
        })

        it('should throw unauthorized when refresh token is not stored in database', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)
            await refreshTokenRepository.deleteAll()

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken })

            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND)
            expect(await refreshTokenRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when refreshing with a token revoked by logout', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const logoutResponse = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/logout')
                .send({ refreshToken })

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken })

            expect(logoutResponse.statusCode).toBe(201)
            expect(response.statusCode).toBe(401)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND)
            expect(await refreshTokenRepository.count()).toEqual(0)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await refreshTokenRepository.count()).toEqual(0)
        })

        it('should throw invalid request when refresh token is not a string', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken: 123456 })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when refresh token is empty', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken: '' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when forbidden fields passed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken: 'toto', password: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when empty body', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })
    })
})
