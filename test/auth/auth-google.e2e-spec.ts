import { BadRequestException, INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AppModule } from 'src/app.module';
import { GoogleService } from "src/common/services/google.service";
import { Settings } from "src/modules/settings/settings.entity";
import { Currency } from "src/modules/settings/types";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";

describe("POST auth/google", () => {
    let app: INestApplication;
    let userRepository: Repository<User>;
    let settingsRepository: Repository<Settings>;

    const googleServiceMocked = {
        verifyIdToken: jest.fn()
    }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                AppModule
            ]
        }).overrideProvider(GoogleService)
            .useValue(googleServiceMocked)
            .compile()

        app = moduleRef.createNestApplication();
        userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User))
        settingsRepository = moduleRef.get<Repository<Settings>>(getRepositoryToken(Settings))

        await app.init();
    })

    beforeEach(async () => {
        await settingsRepository.deleteAll()
        await userRepository.deleteAll()
    })

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Success cases', () => {

        it('should return 201 when user signed up successfully', async () => {
            const userEmail = 'test@gmail.com'
            googleServiceMocked.verifyIdToken.mockResolvedValue({
                id: 'id-token',
                payload: { email: userEmail, name: 'test' }
            })
            const response = await request(app.getHttpServer())
                .post('/auth/google')
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
            expect(response.body.accessToken).toBeTruthy()
            expect(response.body.refreshToken).toBeTruthy()
            expect(user?.email).toBe(userEmail)
            expect(user?.authProviders).toContain(AuthProvider.GOOGLE)
            expect(user?.settings?.monthlyBudget).toBeFalsy()
            expect(user?.settings?.primaryCurrency).toBe(Currency.EUR)
        })

        it('should return 201 when user signed up successfully when user already signup as with email provider', async () => {
            const userEmail = 'test@gmail.com'

            const userWithEmailProvider = await userRepository.save({
                email: userEmail,
                authProviders: [AuthProvider.EMAIL],
                settings: {}
            })

            googleServiceMocked.verifyIdToken.mockResolvedValue({
                id: 'id-token',
                payload: { email: userEmail, name: 'test' }
            })

            const response = await request(app.getHttpServer())
                .post('/auth/google')
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
            expect(response.body.accessToken).toBeTruthy()
            expect(response.body.refreshToken).toBeTruthy()
            expect(user?.id).toEqual(userWithEmailProvider.id)
            expect(user?.email).toBe(userEmail)
            expect(user?.authProviders).toContain(AuthProvider.GOOGLE)
            expect(user?.authProviders).toContain(AuthProvider.EMAIL)
            expect(user?.settings?.monthlyBudget).toBeFalsy()
            expect(user?.settings?.primaryCurrency).toBe(Currency.EUR)
        })
    })

    describe('Failure cases', () => {
        it('should throw BadRequestException when google verification token id fails', async () => {
            googleServiceMocked.verifyIdToken.mockRejectedValueOnce(new BadRequestException('Invalid id token'))

            const response = await request(app.getHttpServer())
                .post('/auth/google')
                .send({ idToken: 'id-token' });

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe('Invalid id token')
        })
    })

    afterAll(async () => {
        await app.close()
    })
})