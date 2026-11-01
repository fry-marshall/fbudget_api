import { ERRORS_MESSAGES } from "src/common/constants";
import { Account } from "src/modules/accounts/account.entity";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST transactions', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let transactionRepository: Repository<Transaction>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const validBody = (account: Account) => ({ amount: -4250, occurredOn: '2026-10-30', accountId: account.id })

    beforeAll(async () => {
        ctx = await createTestApp()
        userRepository = ctx.repo(User)
        transactionRepository = ctx.repo(Transaction)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should create the transaction with all fields and return it', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const body = { ...validBody(account), categoryId: category.id, merchant: 'Carrefour Express', note: 'Courses', tags: ['maison', 'semaine'] }

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            const transactionCreated = await transactionRepository.findOneBy({ userId: user.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({
                id: transactionCreated!.id,
                ...body,
                sourceType: TransactionSourceType.MANUAL,
                provisionId: null,
                installmentId: null,
                savingsGoalId: null,
                createdAt: transactionCreated!.createdAt!.toISOString(),
            })
            expect(transactionCreated).toMatchObject({ ...body, sourceType: TransactionSourceType.MANUAL })
        })

        it('should create the transaction with only the required fields', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(validBody(account))

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toMatchObject({ ...validBody(account), categoryId: null, merchant: null, note: null, tags: [], sourceType: TransactionSourceType.MANUAL })
        })

        it.each([
            ['amount', 248000],
            ['amount', 1],
            ['amount', -1],
            ['amount', 2147483647],
            ['amount', -2147483647],
            ['occurredOn', '2020-01-01'],
            ['occurredOn', '2028-02-29'],
            ['tags', []],
            ['tags', Array.from({ length: 10 }, (_, index) => `tag${index}`)],
            ['tags', ['a'.repeat(30)]],
            ['categoryId', null],
            ['merchant', null],
            ['note', null],
        ])('should accept %s %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...validBody(account), [field]: value })

            expect(response.statusCode).toBe(201)
            expect(response.body.data[field]).toEqual(value)
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['amount', undefined],
            ['amount', 0],
            ['amount', 15.5],
            ['amount', '-4250'],
            ['amount', 2147483648],
            ['amount', -2147483648],
            ['amount', null],
            ['occurredOn', undefined],
            ['occurredOn', null],
            ['occurredOn', '2026-10-30T10:00:00Z'],
            ['occurredOn', '30/10/2026'],
            ['occurredOn', '2026-02-30'],
            ['occurredOn', '2026-13-01'],
            ['accountId', undefined],
            ['accountId', null],
            ['accountId', 'toto'],
            ['categoryId', 'toto'],
            ['merchant', ''],
            ['merchant', 123],
            ['note', ''],
            ['tags', 'maison'],
            ['tags', null],
            ['tags', ['']],
            ['tags', [123]],
            ['tags', ['a'.repeat(31)]],
            ['tags', Array.from({ length: 11 }, (_, index) => `tag${index}`)],
            ['sourceType', TransactionSourceType.FIXED_CHARGE],
            ['provisionId', '00000000-0000-0000-0000-000000000000'],
            ['installmentId', '00000000-0000-0000-0000-000000000000'],
            ['savingsGoalId', '00000000-0000-0000-0000-000000000000'],
            ['userId', UNKNOWN_ID],
            ['id', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...validBody(account), [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw not found when account does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ amount: -4250, occurredOn: '2026-10-30', accountId: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw not found when account belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(validBody(otherAccount))

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw not found when category does not exist', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...validBody(account), categoryId: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw not found when category belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const account = await createAccount(ctx, user)
            const otherCategory = await createCategory(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...validBody(account), categoryId: otherCategory.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw bad request when body is empty', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ amount: -4250, occurredOn: '2026-10-30', accountId: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .send({ amount: -4250, occurredOn: '2026-10-30', accountId: UNKNOWN_ID })

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', 'Bearer toto')
                .send({ amount: -4250, occurredOn: '2026-10-30', accountId: UNKNOWN_ID })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(validBody(account))

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/transactions')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(validBody(account))

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })
    })
})
