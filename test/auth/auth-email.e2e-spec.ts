import { MailService } from "src/common/services/mail.service";
import { User } from "src/modules/users/user.entity";
import { Repository } from "typeorm";
import request from 'supertest';
import { AuthProvider } from "src/modules/users/types";
import { resetDatabase } from "../utils/database";
import { createUserWithPendingOtp, expectValidOtp, findUserWithOtp, getSentOtp, TEST_EMAIL } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST auth/email', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;

    const mailServiceMocked = {
        sendMail: jest.fn()
    }

    beforeAll(async () => {
        ctx = await createTestApp([
            { provider: MailService, useValue: mailServiceMocked }
        ])
        userRepository = ctx.repo(User)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
        mailServiceMocked.sendMail.mockResolvedValue(null)
    })

    afterEach(() => {
        jest.clearAllMocks();
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should return OTP send successfully with only email as AuthProvider', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
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
            await expectValidOtp(await findUserWithOtp(ctx), getSentOtp(mailServiceMocked))
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(1)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledWith(expect.objectContaining({
                receiver: TEST_EMAIL,
                subject: 'Connexion à FBudget : Voici le code de vérification à 6 chiffres',
                template: 'otp-verification'
            }))
        })

        it('should return OTP send successfully with account already exists with Google as AuthProvider', async () => {
            const userCreatedWithGoogleProvider = await userRepository.save({
                email: TEST_EMAIL,
                authProviders: [AuthProvider.GOOGLE],
                settings: {}
            })

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreated = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.message).toBe('OTP send successfully')
            expect(userCreated).not.toBeNull()
            expect(userCreated?.id).toBe(userCreatedWithGoogleProvider.id)
            expect(userCreated?.authProviders).toContain(AuthProvider.EMAIL)
            expect(userCreated?.authProviders).toContain(AuthProvider.GOOGLE)
            await expectValidOtp(await findUserWithOtp(ctx), getSentOtp(mailServiceMocked))
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(1)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledWith(expect.objectContaining({
                receiver: TEST_EMAIL,
                template: 'otp-verification'
            }))
        })

        it('should return OTP send successfully with account already exists with Email as AuthProvider', async () => {
            await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreatedFirst = await findUserWithOtp(ctx)

            const response_2 = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreatedAfter = await findUserWithOtp(ctx)

            expect(response_2.statusCode).toBe(201)
            expect(response_2.body.data.message).toBe('OTP send successfully')
            expect(userCreatedFirst).not.toBeNull()
            expect(userCreatedAfter).not.toBeNull()
            expect(userCreatedAfter?.id).toBe(userCreatedFirst?.id)
            expect(await userRepository.count()).toBe(1)
            expect(userCreatedAfter?.authProviders).toEqual([AuthProvider.EMAIL])
            expect(userCreatedAfter?.otpCode).not.toEqual(userCreatedFirst?.otpCode)
            expect(userCreatedAfter?.otpExpiresAt).not.toEqual(userCreatedFirst?.otpExpiresAt)
            await expectValidOtp(userCreatedAfter, getSentOtp(mailServiceMocked))
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(2)
            expect(mailServiceMocked.sendMail).toHaveBeenLastCalledWith(expect.objectContaining({
                receiver: TEST_EMAIL,
                template: 'otp-verification'
            }))
        })

        it('should replace the previous OTP and send it with the user display name when resending a code', async () => {
            const userCreated = await createUserWithPendingOtp(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .send({ email: TEST_EMAIL })

            const userWithNewOtp = await findUserWithOtp(ctx)

            expect(response.statusCode).toBe(201)
            expect(response.body.data.message).toBe('OTP send successfully')
            expect(userWithNewOtp?.otpCode).not.toEqual(userCreated.otpCode)
            await expectValidOtp(userWithNewOtp, getSentOtp(mailServiceMocked))
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(1)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledWith(expect.objectContaining({
                receiver: TEST_EMAIL,
                context: {
                    code: getSentOtp(mailServiceMocked),
                    name: 'marshall'
                }
            }))
        })

        it('should return OTP send successfully when creating an account with a deleted email', async () => {
            await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreatedFirst = await findUserWithOtp(ctx)

            await userRepository.softDelete({ id: userCreatedFirst?.id })

            const response_2 = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .send({ email: TEST_EMAIL });

            const userCreatedAfter = await findUserWithOtp(ctx)
            const userDeleted = await userRepository.findOne({ where: { id: userCreatedFirst?.id }, withDeleted: true })

            expect(response_2.statusCode).toBe(201)
            expect(response_2.body.data.message).toBe('OTP send successfully')
            expect(userCreatedFirst).not.toBeNull()
            expect(userCreatedAfter).not.toBeNull()
            expect(userCreatedAfter?.id).not.toBe(userCreatedFirst?.id)
            expect(userDeleted?.deletedAt).toBeTruthy()
            expect(userCreatedAfter?.authProviders).toEqual([AuthProvider.EMAIL])
            await expectValidOtp(userCreatedAfter, getSentOtp(mailServiceMocked))
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(2)
            expect(mailServiceMocked.sendMail).toHaveBeenLastCalledWith(expect.objectContaining({
                receiver: TEST_EMAIL,
                template: 'otp-verification'
            }))
        })
    })

    describe('Failure cases', () => {
        it('should throw exception when mailerService is down', async () => {
            mailServiceMocked.sendMail.mockRejectedValueOnce(new Error('SMTP Timeout'))

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .send({ email: TEST_EMAIL })

            expect(response.statusCode).toBe(500)
            expect(response.body.message).toBe('An error has occured')

            // User and OTP are persisted before the mail is sent
            const userCreated = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            expect(userCreated?.authProviders).toEqual([AuthProvider.EMAIL])
            await expectValidOtp(await findUserWithOtp(ctx), getSentOtp(mailServiceMocked))
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(1)
        })

        it('should throw bad exception for invalid email', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .send({ email: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe('Invalid request')
            expect(await userRepository.count()).toBe(0)
            expect(mailServiceMocked.sendMail).not.toHaveBeenCalled()
        })

        it('should throw bad exception for empty body', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe('Invalid request')
            expect(await userRepository.count()).toBe(0)
            expect(mailServiceMocked.sendMail).not.toHaveBeenCalled()
        })

        it('should throw bad exception for non authorized fields', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .send({ email: TEST_EMAIL, password: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe('Invalid request')
            expect(await userRepository.count()).toBe(0)
            expect(mailServiceMocked.sendMail).not.toHaveBeenCalled()
        })
    })
})
