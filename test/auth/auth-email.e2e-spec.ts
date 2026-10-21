import { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AppModule } from "src/app.module";
import { setupApp } from "src/setup-app";
import { MailService } from "src/common/services/mail.service";
import { Settings } from "src/modules/settings/settings.entity";
import { User } from "src/modules/users/user.entity";
import { Repository } from "typeorm";
import request from 'supertest';
import { AuthProvider } from "src/modules/users/types";
import { TEST_EMAIL, expectValidOtp } from "../helpers";

describe('POST auth/email', () => {
    let app: INestApplication;
    let settingsRepository: Repository<Settings>;
    let userRepository: Repository<User>;

    const mailServiceMocked = {
        sendMail: jest.fn()
    }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule]
        })
            .overrideProvider(MailService)
            .useValue(mailServiceMocked)
            .compile()

        app = moduleRef.createNestApplication()
        setupApp(app)
        settingsRepository = moduleRef.get<Repository<Settings>>(getRepositoryToken(Settings))
        userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User))

        await app.init();
    })

    beforeEach(async () => {
        await settingsRepository.deleteAll()
        await userRepository.deleteAll()
        mailServiceMocked.sendMail.mockResolvedValue(null)
    })

    afterEach(() => {
        jest.clearAllMocks();
    })

    afterAll(async () => {
        await app.close();
    })

    describe('Success cases', () => {
        it('should return OTP send successfully with only email as AuthProvider', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreated = await userRepository.findOne({
                relations: { settings: true },
                where: { email: TEST_EMAIL }
            })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.message).toBe('OTP send successfully')
            expect(userCreated).not.toBeNull()
            expect(userCreated?.settings).toBeDefined()
            expect(userCreated?.authProviders).toEqual([AuthProvider.EMAIL])
            expectValidOtp(userCreated)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(1)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledWith(expect.objectContaining({
                receiver: TEST_EMAIL,
                subject: 'Connexion à FBudget : Voici le code de vérification à 6 chiffres',
                template: 'otp-verification',
                context: expect.objectContaining({ code: userCreated?.otpCode })
            }))
        })

        it('should return OTP send successfully with account already exists with Google as AuthProvider', async () => {
            const userCreatedWithGoogleProvider = await userRepository.save({
                email: TEST_EMAIL,
                authProviders: [AuthProvider.GOOGLE],
                settings: {}
            })

            const response = await request(app.getHttpServer())
                .post('/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreated = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.message).toBe('OTP send successfully')
            expect(userCreated).not.toBeNull()
            expect(userCreated?.id).toBe(userCreatedWithGoogleProvider.id)
            expect(userCreated?.authProviders).toContain(AuthProvider.EMAIL)
            expect(userCreated?.authProviders).toContain(AuthProvider.GOOGLE)
            expectValidOtp(userCreated)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(1)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledWith(expect.objectContaining({
                receiver: TEST_EMAIL,
                template: 'otp-verification',
                context: expect.objectContaining({ code: userCreated?.otpCode })
            }))
        })

        it('should return OTP send successfully with account already exists with Email as AuthProvider', async () => {
            await request(app.getHttpServer())
                .post('/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreatedFirst = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            const response_2 = await request(app.getHttpServer())
                .post('/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreatedAfter = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            expect(response_2.statusCode).toBe(201)
            expect(response_2.body.data.message).toBe('OTP send successfully')
            expect(userCreatedFirst).not.toBeNull()
            expect(userCreatedAfter).not.toBeNull()
            expect(userCreatedAfter?.id).toBe(userCreatedFirst?.id)
            expect(await userRepository.count()).toBe(1)
            expect(userCreatedAfter?.authProviders).toEqual([AuthProvider.EMAIL])
            expect(userCreatedAfter?.otpCode).not.toEqual(userCreatedFirst?.otpCode)
            expect(userCreatedAfter?.otpExpiresAt).not.toEqual(userCreatedFirst?.otpExpiresAt)
            expectValidOtp(userCreatedAfter)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(2)
            expect(mailServiceMocked.sendMail).toHaveBeenLastCalledWith(expect.objectContaining({
                receiver: TEST_EMAIL,
                template: 'otp-verification',
                context: expect.objectContaining({ code: userCreatedAfter?.otpCode })
            }))
        })

        it('should return OTP send successfully when creating an account with a deleted email', async () => {
            await request(app.getHttpServer())
                .post('/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreatedFirst = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            await userRepository.softDelete({ id: userCreatedFirst?.id })

            const response_2 = await request(app.getHttpServer())
                .post('/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreatedAfter = await userRepository.findOne({ where: { email: TEST_EMAIL } })
            const userDeleted = await userRepository.findOne({ where: { id: userCreatedFirst?.id }, withDeleted: true })

            expect(response_2.statusCode).toBe(201)
            expect(response_2.body.data.message).toBe('OTP send successfully')
            expect(userCreatedFirst).not.toBeNull()
            expect(userCreatedAfter).not.toBeNull()
            expect(userCreatedAfter?.id).not.toBe(userCreatedFirst?.id)
            expect(userDeleted?.deletedAt).toBeTruthy()
            expect(userCreatedAfter?.authProviders).toEqual([AuthProvider.EMAIL])
            expectValidOtp(userCreatedAfter)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(2)
            expect(mailServiceMocked.sendMail).toHaveBeenLastCalledWith(expect.objectContaining({
                receiver: TEST_EMAIL,
                template: 'otp-verification',
                context: expect.objectContaining({ code: userCreatedAfter?.otpCode })
            }))
        })
    })

    describe('Failure cases', () => {
        it('should throw exception when mailerService is down', async () => {
            mailServiceMocked.sendMail.mockRejectedValueOnce(new Error('SMTP Timeout'))

            const response = await request(app.getHttpServer())
                .post('/auth/email')
                .send({ email: TEST_EMAIL })

            expect(response.statusCode).toBe(500)
            expect(response.body.message).toBe('An error has occured')

            // User and OTP are persisted before the mail is sent
            const userCreated = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            expect(userCreated?.authProviders).toEqual([AuthProvider.EMAIL])
            expectValidOtp(userCreated)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(1)
        })

        it('should throw bad exception for invalid email', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/email')
                .send({ email: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe('Invalid request')
            expect(await userRepository.count()).toBe(0)
            expect(mailServiceMocked.sendMail).not.toHaveBeenCalled()
        })

        it('should throw bad exception for empty body', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/email')
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe('Invalid request')
            expect(await userRepository.count()).toBe(0)
            expect(mailServiceMocked.sendMail).not.toHaveBeenCalled()
        })

        it('should throw bad exception for non authorized fields', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/email')
                .send({ email: TEST_EMAIL, password: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe('Invalid request')
            expect(await userRepository.count()).toBe(0)
            expect(mailServiceMocked.sendMail).not.toHaveBeenCalled()
        })
    })
})
