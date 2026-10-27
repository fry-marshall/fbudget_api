import { getOptionsToken } from "@nestjs/throttler";
import { ERRORS_MESSAGES } from "src/common/constants";
import { MailService } from "src/common/services/mail.service";
import request from 'supertest';
import { resetDatabase } from "../utils/database";
import { OTP_CODE, TEST_EMAIL } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

const THROTTLE_LIMIT = 5

describe('Throttling on POST auth/email and auth/verify-otp', () => {
    let ctx: TestContext;

    const mailServiceMocked = {
        sendMail: jest.fn()
    }

    // Each test uses its own client IP through X-Forwarded-For, the counters are kept in memory for the whole app
    let ipCounter = 0
    const nextIp = () => `10.0.0.${++ipCounter}`

    const callTimes = async (times: number, path: string, body: object, ip: string) => {
        const responses: request.Response[] = []
        for (let i = 0; i < times; i++) {
            responses.push(await request(ctx.app.getHttpServer()).post(path).set('X-Forwarded-For', ip).send(body))
        }
        return responses
    }

    beforeAll(async () => {
        ctx = await createTestApp([
            { provider: MailService, useValue: mailServiceMocked },
            {
                provider: getOptionsToken(),
                useValue: {
                    throttlers: [{ ttl: 60000, limit: THROTTLE_LIMIT }],
                    errorMessage: ERRORS_MESSAGES.EXCEPTIONS.TOO_MANY_REQUESTS
                }
            }
        ])
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
        jest.clearAllMocks()
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should accept requests up to the limit on auth/email', async () => {
            const responses = await callTimes(THROTTLE_LIMIT, '/api/v1/auth/email', { email: TEST_EMAIL }, nextIp())

            expect(responses.map((response) => response.statusCode)).toEqual(Array(THROTTLE_LIMIT).fill(201))
        })

        it('should not block another IP when one IP reached the limit', async () => {
            await callTimes(THROTTLE_LIMIT + 1, '/api/v1/auth/email', { email: TEST_EMAIL }, nextIp())

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/email')
                .set('X-Forwarded-For', nextIp())
                .send({ email: TEST_EMAIL })

            expect(response.statusCode).toBe(201)
        })

        it('should count each route separately', async () => {
            const ip = nextIp()
            await callTimes(THROTTLE_LIMIT + 1, '/api/v1/auth/email', { email: TEST_EMAIL }, ip)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/verify-otp')
                .set('X-Forwarded-For', ip)
                .send({ email: TEST_EMAIL, code: OTP_CODE })

            expect(response.statusCode).toBe(401)
        })
    })

    describe('Failure cases', () => {
        it('should throw too many requests on auth/email above the limit', async () => {
            const responses = await callTimes(THROTTLE_LIMIT + 1, '/api/v1/auth/email', { email: TEST_EMAIL }, nextIp())
            const lastResponse = responses[THROTTLE_LIMIT]

            expect(lastResponse.statusCode).toBe(429)
            expect(lastResponse.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.TOO_MANY_REQUESTS)
            expect(mailServiceMocked.sendMail).toHaveBeenCalledTimes(THROTTLE_LIMIT)
        })

        it('should throw too many requests on auth/verify-otp above the limit', async () => {
            const responses = await callTimes(THROTTLE_LIMIT + 1, '/api/v1/auth/verify-otp', { email: TEST_EMAIL, code: OTP_CODE }, nextIp())
            const lastResponse = responses[THROTTLE_LIMIT]

            expect(responses.slice(0, THROTTLE_LIMIT).map((response) => response.statusCode)).toEqual(Array(THROTTLE_LIMIT).fill(401))
            expect(lastResponse.statusCode).toBe(429)
            expect(lastResponse.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.TOO_MANY_REQUESTS)
        })
    })
})
