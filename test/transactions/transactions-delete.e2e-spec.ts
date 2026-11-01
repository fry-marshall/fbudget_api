import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "src/modules/accounts/account.entity";
import { Transaction } from "src/modules/transactions/transaction.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createTransaction, createTransfer, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('DELETE transactions/:id', () => {
    let ctx: TestContext;
    let transactionRepository: Repository<Transaction>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

    beforeAll(async () => {
        ctx = await createTestApp()
        transactionRepository = ctx.repo(Transaction)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should delete the transaction and keep the other ones and its account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)
            const otherTransaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.message).toBe(SUCCESS_MESSAGES.TRANSACTION.TRANSACTION_DELETED)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toBeNull()
            expect(await transactionRepository.findOneBy({ id: otherTransaction.id })).not.toBeNull()
            expect(await ctx.repo(Account).findOneBy({ id: account.id })).not.toBeNull()
        })

        it.each([
            ['debit', 'from'],
            ['credit', 'to'],
        ])('should delete both transactions of a transfer when deleting its %s', async (_, leg) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions' })
            const transfer = await createTransfer(ctx, user, account, provisionsAccount)
            const otherTransfer = await createTransfer(ctx, user, account, provisionsAccount)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${transfer[leg].id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await transactionRepository.countBy({ transferId: transfer.transferId })).toEqual(0)
            expect(await transactionRepository.countBy({ transferId: otherTransfer.transferId })).toEqual(2)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).not.toBeNull()
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/transactions/toto')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when transaction does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
        })

        it('should throw not found when transaction is already deleted', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)

            const firstResponse = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
            const secondResponse = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(firstResponse.statusCode).toBe(200)
            expect(secondResponse.statusCode).toBe(404)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
        })

        it('should throw not found and keep the transaction when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const otherTransaction = await createTransaction(ctx, otherUser, otherAccount)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${otherTransaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
            expect(await transactionRepository.findOneBy({ id: otherTransaction.id })).not.toBeNull()
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${transaction.id}`)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).not.toBeNull()
        })
    })
})
