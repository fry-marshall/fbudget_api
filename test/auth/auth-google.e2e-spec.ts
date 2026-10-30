import { BadRequestException } from "@nestjs/common"
import { GoogleService } from "src/common/services/google.service";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { buildUser, TEST_EMAIL } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe("POST auth/google", () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;

    const googleServiceMocked = {
        verifyIdToken: jest.fn()
    }

    beforeAll(async () => {
        ctx = await createTestApp([
            { provider: GoogleService, useValue: googleServiceMocked }
        ])
        userRepository = ctx.repo(User)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Success cases', () => {

        it('should return 201 when user signed up successfully', async () => {
            const userEmail = TEST_EMAIL
            googleServiceMocked.verifyIdToken.mockResolvedValue({
                id: 'id-token',
                payload: { email: userEmail, name: 'test' }
            })
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/google')
                .send({ idToken: 'id-token' });

            const user = await userRepository.findOne({
                select: {
                    id: true,
                    email: true,
                    authProviders: true,
                    settings: {
                        id: true,
                        monthlyBudget: true,
                        primaryCurrency: true,
                    }
                },
                relations: { settings: true },
                where: { email: userEmail },
            });

            expect(response.statusCode).toBe(201)
            expect(response.body.data.accessToken).toBeTruthy()
            expect(response.body.data.refreshToken).toBeTruthy()
            expect(user?.email).toBe(userEmail)
            expect(user?.authProviders).toContain(AuthProvider.GOOGLE)
            expect(user?.settings?.monthlyBudget).toBeFalsy()
            expect(user?.settings?.primaryCurrency).toBeNull()
        })

        it('should return 201 when user signed up successfully when user already signup as with email provider', async () => {
            const userEmail = TEST_EMAIL

            const userWithEmailProvider = await userRepository.save(buildUser({ email: userEmail }))

            googleServiceMocked.verifyIdToken.mockResolvedValue({
                id: 'id-token',
                payload: { email: userEmail, name: 'test' }
            })

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/google')
                .send({ idToken: 'id-token' });

            const user = await userRepository.findOne({
                select: {
                    id: true,
                    email: true,
                    authProviders: true,
                    settings: {
                        id: true,
                        monthlyBudget: true,
                        primaryCurrency: true,
                    }
                },
                relations: { settings: true },
                where: { email: userEmail },
            });

            expect(response.statusCode).toBe(201)
            expect(response.body.data.accessToken).toBeTruthy()
            expect(response.body.data.refreshToken).toBeTruthy()
            expect(user?.id).toEqual(userWithEmailProvider.id)
            expect(user?.email).toBe(userEmail)
            expect(user?.authProviders).toContain(AuthProvider.GOOGLE)
            expect(user?.authProviders).toContain(AuthProvider.EMAIL)
            expect(user?.settings?.monthlyBudget).toBeFalsy()
            expect(user?.settings?.primaryCurrency).toBeNull()
        })
    })

    describe('Failure cases', () => {
        it('should throw BadRequestException when google verification token id fails', async () => {
            googleServiceMocked.verifyIdToken.mockRejectedValueOnce(new BadRequestException('Invalid id token'))

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/google')
                .send({ idToken: 'id-token' });

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe('Invalid id token')
        })
    })

    afterAll(async () => {
        await ctx.app.close()
    })
})