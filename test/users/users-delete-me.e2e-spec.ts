import { INestApplication } from "@nestjs/common"
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AppModule } from "src/app.module";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { Settings } from "src/modules/settings/settings.entity";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import { setupApp } from "src/setup-app";
import { createUserWithRefreshToken, signAccessToken } from "../helpers";
import { Repository } from "typeorm";
import request from 'supertest'
import { ERRORS_MESSAGES } from "src/common/constants";


describe('DELETE users/me', () => {

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
        setupApp(app);
        userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User))
        settingsRepository = moduleRef.get<Repository<Settings>>(getRepositoryToken(Settings))
        refreshTokenRepository = moduleRef.get<Repository<RefreshToken>>(getRepositoryToken(RefreshToken))
        jwtService = moduleRef.get(JwtService)
        configService = moduleRef.get(ConfigService)
        await app.init()
    })

    beforeEach(async () => {
        await userRepository.deleteAll()
        await settingsRepository.deleteAll()
        await refreshTokenRepository.deleteAll()
    })

    afterAll(async () => {
        await app.close()
    })

    describe('Success cases', () => {
        it.each([
            AuthProvider.EMAIL,
            AuthProvider.GOOGLE,
        ])('should delete the user registered with %s', async (authProvider) => {
            const {user, accessToken} = await createUserWithAccessToken(authProvider)

            const response = await request(app.getHttpServer())
                .delete('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
            

            expect(response.statusCode).toEqual(200)
            expect(response.body.data.message).toEqual(ERRORS_MESSAGES.USER.USER_DELETED)

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
            const response = await request(app.getHttpServer())
                .delete('/users/me')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(app.getHttpServer())
                .delete('/users/me')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized and keep the user when token is expired', async () => {
            const { user } = await createUserWithAccessToken()
            const expiredAccessToken = signAccessToken(jwtService, configService, user, -10)

            const response = await request(app.getHttpServer())
                .delete('/users/me')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await userRepository.findOneBy({ id: user.id })).not.toBeNull()
        })

        it('should throw unauthorized and keep the user when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)

            const response = await request(app.getHttpServer())
                .delete('/users/me')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await userRepository.findOneBy({ id: user.id })).not.toBeNull()
            expect(await refreshTokenRepository.count({ where: { user: { id: user.id } } })).toEqual(1)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserWithAccessToken()
            await userRepository.delete(user.id!)

            const response = await request(app.getHttpServer())
                .delete('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when user is already deleted', async () => {
            const { user, accessToken } = await createUserWithAccessToken()

            const firstResponse = await request(app.getHttpServer())
                .delete('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
            const deletedAt = (await userRepository.findOne({ where: { id: user.id }, withDeleted: true }))?.deletedAt

            const secondResponse = await request(app.getHttpServer())
                .delete('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(firstResponse.statusCode).toBe(200)
            expect(secondResponse.statusCode).toBe(404)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect((await userRepository.findOne({ where: { id: user.id }, withDeleted: true }))?.deletedAt).toEqual(deletedAt)
        })

        it('should throw not found when refreshing with the refresh token of a deleted user', async () => {
            const { user, refreshToken } = await createUserWithRefreshToken(userRepository, refreshTokenRepository, jwtService, configService)
            const accessToken = signAccessToken(jwtService, configService, user)

            await request(app.getHttpServer())
                .delete('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            const response = await request(app.getHttpServer())
                .post('/auth/refresh')
                .send({ refreshToken })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when getting me with the access token of a deleted user', async () => {
            const { accessToken } = await createUserWithAccessToken()

            await request(app.getHttpServer())
                .delete('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            const response = await request(app.getHttpServer())
                .get('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })
    })

})