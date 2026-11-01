import { ERRORS_MESSAGES } from "src/common/constants";
import { InstallmentPlan } from "src/modules/installment-plans/installment-plan.entity";
import { Installment } from "src/modules/installment-plans/installment.entity";
import { InstallmentPlanStatus } from "src/modules/installment-plans/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST installment-plans', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let planRepository: Repository<InstallmentPlan>;
    let installmentRepository: Repository<Installment>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const VALID_BODY = { label: 'iPhone 15', provider: 'Klarna', totalAmount: 75000, installmentCount: 4, firstDueDate: '2099-01-15' }

    beforeAll(async () => {
        ctx = await createTestApp()
        userRepository = ctx.repo(User)
        planRepository = ctx.repo(InstallmentPlan)
        installmentRepository = ctx.repo(Installment)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should create the plan and generate its installments', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: account.id, categoryId: category.id })

            const planCreated = await planRepository.findOneBy({ userId: user.id })
            const installments = await installmentRepository.find({ where: { planId: planCreated!.id }, order: { index: 'ASC' } })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({
                id: planCreated!.id,
                ...VALID_BODY,
                installmentAmount: 18750,
                status: InstallmentPlanStatus.ACTIVE,
                paidCount: 0,
                remainingDue: 75000,
                nextInstallment: { id: installments[0].id, index: 1, dueDate: '2099-01-15', amount: 18750 },
                accountId: account.id,
                categoryId: category.id,
            })
            expect(installments.map(({ index, dueDate, amount }) => ({ index, dueDate, amount }))).toEqual([
                { index: 1, dueDate: '2099-01-15', amount: 18750 },
                { index: 2, dueDate: '2099-02-15', amount: 18750 },
                { index: 3, dueDate: '2099-03-15', amount: 18750 },
                { index: 4, dueDate: '2099-04-15', amount: 18750 },
            ])
        })

        it('should put the remainder on the last installment', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, totalAmount: 10000, installmentCount: 3 })

            const installments = await installmentRepository.find({ where: { planId: response.body.data.id }, order: { index: 'ASC' } })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({ installmentAmount: 3333, remainingDue: 10000 })
            expect(installments.map((installment) => installment.amount)).toEqual([3333, 3333, 3334])
            expect(await planRepository.countBy({ userId: user.id })).toEqual(1)
        })

        it('should create the plan without provider, account and category', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { provider, ...body } = VALID_BODY

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({ provider: null, accountId: null, categoryId: null })
        })

        it.each([
            ['installmentCount', 2],
            ['installmentCount', 60],
            ['totalAmount', 2147483647],
            ['provider', null],
        ])('should accept %s %p', async (field, value) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(201)
            expect(response.body.data[field]).toBe(value)
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['label', undefined],
            ['label', ''],
            ['provider', ''],
            ['totalAmount', undefined],
            ['totalAmount', 0],
            ['totalAmount', 1],
            ['totalAmount', 15.5],
            ['totalAmount', 2147483648],
            ['installmentCount', undefined],
            ['installmentCount', 1],
            ['installmentCount', 61],
            ['installmentCount', 2.5],
            ['firstDueDate', undefined],
            ['firstDueDate', '2099-02-30'],
            ['accountId', 'toto'],
            ['categoryId', 'toto'],
            ['status', InstallmentPlanStatus.CANCELLED],
            ['installmentAmount', 18750],
            ['userId', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await planRepository.count()).toEqual(0)
            expect(await installmentRepository.count()).toEqual(0)
        })

        it('should throw bad request when the total amount is lower than the number of installments', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, totalAmount: 3, installmentCount: 4 })

            expect(response.statusCode).toBe(400)
            expect(await planRepository.count()).toEqual(0)
        })

        it.each([
            ['account does not exist', 'accountId', ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND],
            ['category does not exist', 'categoryId', ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND],
        ])('should throw not found when %s', async (_, field, message) => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(message)
            expect(await planRepository.count()).toEqual(0)
        })

        it('should throw not found when account belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await planRepository.count()).toEqual(0)
        })

        it('should throw not found and create no installment when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            expect(await planRepository.count()).toEqual(0)
            expect(await installmentRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await planRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', 'Bearer toto')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await planRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/installment-plans')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await planRepository.count()).toEqual(0)
        })
    })
})
