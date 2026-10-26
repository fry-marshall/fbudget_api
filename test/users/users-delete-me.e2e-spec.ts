import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import { Repository } from "typeorm";
import request from 'supertest'
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { resetDatabase } from "../utils/database";
import { createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('DELETE users/me', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let refreshTokenRepository: Repository<RefreshToken>;

    beforeAll(async () => {
        ctx = await createTestApp()
        userRepository = ctx.repo(User)
        refreshTokenRepository = ctx.repo(RefreshToken)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it.each([
            AuthProvider.EMAIL,
            AuthProvider.GOOGLE,
        ])('should delete the user registered with %s', async (authProvider) => {
            const {user, accessToken} = await createUserAndLogin(ctx, { authProviders: [authProvider] })

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
            

            expect(response.statusCode).toEqual(200)
            expect(response.body.data.message).toEqual(SUCCESS_MESSAGES.USER.USER_DELETED)

            const activeUser = await userRepository.findOne({where: {id: user.id}})
            const deletedUser = await userRepository.findOne({where: {id: user.id}, withDeleted: true},)

            expect(activeUser).toBeNull()
            expect(deletedUser?.id).toBe(user.id)
            expect(deletedUser?.deletedAt).toBeInstanceOf(Date)
            expect(await refreshTokenRepository.count({ where: { user: { id: user.id } } })).toEqual(0)
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized and keep the user when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await userRepository.findOneBy({ id: user.id })).not.toBeNull()
        })

        it('should throw unauthorized and keep the user when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await userRepository.findOneBy({ id: user.id })).not.toBeNull()
            expect(await refreshTokenRepository.count({ where: { user: { id: user.id } } })).toEqual(1)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when user is already deleted', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const firstResponse = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
            const deletedAt = (await userRepository.findOne({ where: { id: user.id }, withDeleted: true }))?.deletedAt

            const secondResponse = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(firstResponse.statusCode).toBe(200)
            expect(secondResponse.statusCode).toBe(404)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect((await userRepository.findOne({ where: { id: user.id }, withDeleted: true }))?.deletedAt).toEqual(deletedAt)
        })

        it('should throw not found when refreshing with the refresh token of a deleted user', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const accessToken = signAccessToken(ctx, user)

            await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when getting me with the access token of a deleted user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })
    })

})