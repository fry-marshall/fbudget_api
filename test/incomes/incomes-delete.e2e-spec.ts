import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "src/modules/accounts/account.entity";
import { Income } from "src/modules/incomes/income.entity";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createIncome, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('DELETE incomes/:id', () => {
    let ctx: TestContext;
    let incomeRepository: Repository<Income>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

    beforeAll(async () => {
        ctx = await createTestApp()
        incomeRepository = ctx.repo(Income)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should delete the income and keep the other ones and its account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const income = await createIncome(ctx, user, { accountId: account.id })
            const otherIncome = await createIncome(ctx, user, { label: 'Freelance' })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.message).toBe(SUCCESS_MESSAGES.INCOME.INCOME_DELETED)
            expect(await incomeRepository.findOneBy({ id: income.id })).toBeNull()
            expect(await incomeRepository.findOneBy({ id: otherIncome.id })).not.toBeNull()
            expect(await ctx.repo(Account).findOneBy({ id: account.id })).not.toBeNull()
        })

        it('should keep its transactions without income', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const income = await createIncome(ctx, user, { accountId: account.id })
            const transaction = await createTransaction(ctx, user, account, { amount: 248000, sourceType: TransactionSourceType.INCOME, incomeId: income.id })

            await request(ctx.app.getHttpServer())
                .delete(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(await ctx.repo(Transaction).findOneBy({ id: transaction.id })).toMatchObject({ incomeId: null, amount: 248000, sourceType: TransactionSourceType.INCOME })
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/incomes/toto')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when income does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/incomes/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INCOMES.INCOME_NOT_FOUND)
        })

        it('should throw not found when income is already deleted', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)

            const firstResponse = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
            const secondResponse = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(firstResponse.statusCode).toBe(200)
            expect(secondResponse.statusCode).toBe(404)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.INCOMES.INCOME_NOT_FOUND)
        })

        it('should throw not found and keep the income when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherIncome = await createIncome(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/incomes/${otherIncome.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.INCOMES.INCOME_NOT_FOUND)
            expect(await incomeRepository.findOneBy({ id: otherIncome.id })).not.toBeNull()
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/incomes/${income.id}`)

            expect(response.statusCode).toBe(401)
            expect(await incomeRepository.findOneBy({ id: income.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/incomes/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await incomeRepository.findOneBy({ id: income.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const income = await createIncome(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/incomes/${income.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await incomeRepository.findOneBy({ id: income.id })).not.toBeNull()
        })
    })
})
