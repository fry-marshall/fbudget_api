import { ERRORS_MESSAGES } from "src/common/constants";
import { generateOtp } from "src/common/helpers/helpers";
import { MailService } from "src/common/services/mail.service";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { expectValidOtp, TEST_EMAIL } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST auth/request-otp', () => {
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
        jest.clearAllMocks()
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should return message: OTP send successfully when otp has been sent', async () => {
            mailServiceMocked.sendMail.mockResolvedValue(null)
            const userCreated = await userRepository.save({
                displayName: 'marshall',
                email: TEST_EMAIL,
                authProviders: [AuthProvider.EMAIL],
                otpCode: generateOtp(),
                otpExpiresAt: new Date(Date.now() + 100000),
                settings: {}
            });

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/request-otp')
                .send({ email: TEST_EMAIL })

            const userWithNewOtp = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.message).toBe("OTP send successfully")
            expect(userWithNewOtp?.otpCode).not.toEqual(userCreated.otpCode)
            expectValidOtp(userWithNewOtp)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(1)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledWith(expect.objectContaining({
                receiver: TEST_EMAIL,
                subject: 'Connexion à FBudget : Voici le code de vérification à 6 chiffres',
                context: {
                    code: userWithNewOtp?.otpCode,
                    name: userWithNewOtp?.displayName
                },
                template: 'otp-verification',
            }))

        })

        it('should return message: OTP send successfully when user doesn\'t exist', async () => {

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/request-otp')
                .send({ email: TEST_EMAIL })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.message).toBe("OTP send successfully")
            expect(mailServiceMocked.sendMail).not.toHaveBeenCalled()
            expect(await userRepository.count()).toEqual(0)
        })

        it('should return message: OTP send successfully when email user doesn\'t exist', async () => {

            await userRepository.save({
                displayName: 'marshall',
                email: TEST_EMAIL,
                authProviders: [AuthProvider.GOOGLE],
                settings: {}
            });

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/request-otp')
                .send({ email: TEST_EMAIL })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.message).toBe("OTP send successfully")
            expect(mailServiceMocked.sendMail).not.toHaveBeenCalled()
        })
    })

    describe('Failure cases', () => {
        it('should throw error when email service is down', async () => {
            mailServiceMocked.sendMail.mockRejectedValue(new Error('SMTP timeout'))

            const userCreated = await userRepository.save({
                displayName: 'marshall',
                email: TEST_EMAIL,
                authProviders: [AuthProvider.EMAIL],
                otpCode: generateOtp(),
                otpExpiresAt: new Date(Date.now() + 100000),
                settings: {}
            });

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/request-otp')
                .send({ email: TEST_EMAIL })

            const userWithNewOtp = await userRepository.findOne({ where: { email: TEST_EMAIL } })

            expect(response.statusCode).toBe(500)
            expect(response.body.message).toBe("An error has occured")
            expect(userWithNewOtp?.otpCode).not.toEqual(userCreated.otpCode)
            expect(userWithNewOtp?.otpExpiresAt?.getTime()).toBeGreaterThan(userCreated.otpExpiresAt.getTime())
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(1)
        })

        it('should throw invalid request when email is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/request-otp')
                .send({ email: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when forbidden fields passed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/request-otp')
                .send({ email: TEST_EMAIL, password: 'toto' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw invalid request when empty body', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/request-otp')
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })
    })

})