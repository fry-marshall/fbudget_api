import { ERRORS_MESSAGES } from "src/common/constants";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "src/modules/transactions/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createTransaction, createTransfer, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT transactions/:id', () => {
    let ctx: TestContext;
    let transactionRepository: Repository<Transaction>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const TRANSACTION_DEFAULTS = { amount: -4250, occurredOn: '2026-10-15', categoryId: null, merchant: null, note: null, tags: [] }

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
        it('should update all the fields and return the transaction', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const otherAccount = await createAccount(ctx, user, { name: 'Wave' })
            const category = await createCategory(ctx, user)
            const transaction = await createTransaction(ctx, user, account)
            const body = { amount: 248000, occurredOn: '2026-11-01', accountId: otherAccount.id, categoryId: category.id, merchant: 'Employeur', note: 'Salaire', tags: ['paie'] }

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                id: transaction.id,
                ...body,
                sourceType: TransactionSourceType.MANUAL,
                provisionId: null,
                installmentId: null,
                savingsGoalId: null,
                transferId: null,
                fixedChargeId: null,
                incomeId: null,
                status: TransactionStatus.CONFIRMED,
                createdAt: transaction.createdAt!.toISOString(),
            })
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject(body)
        })

        it.each([
            ['amount', 1],
            ['amount', -2147483647],
            ['occurredOn', '2026-02-28'],
            ['merchant', 'Carrefour'],
            ['note', 'Courses'],
            ['tags', ['maison']],
        ])('should only update %s to %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...TRANSACTION_DEFAULTS, accountId: account.id, [field]: value })
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject({ ...TRANSACTION_DEFAULTS, accountId: account.id, [field]: value })
        })

        it('should remove the category, the merchant, the note and the tags', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const transaction = await createTransaction(ctx, user, account, { categoryId: category.id, merchant: 'Carrefour', note: 'Courses', tags: ['maison'] })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ categoryId: null, merchant: null, note: null, tags: [] })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...TRANSACTION_DEFAULTS, accountId: account.id })
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject({ ...TRANSACTION_DEFAULTS, accountId: account.id })
        })

        it('should leave the transaction unchanged when body is empty', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account, { tags: ['maison'] })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...TRANSACTION_DEFAULTS, accountId: account.id, tags: ['maison'] })
        })

        it('should update the merchant, the note and the tags of one transaction of a transfer only', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions' })
            const transfer = await createTransfer(ctx, user, account, provisionsAccount)
            const body = { merchant: 'Virement', note: 'Provisions de novembre', tags: ['provisions'] }

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transfer.from.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...body, amount: -5834, transferId: transfer.transferId, sourceType: TransactionSourceType.TRANSFER })
            expect(await transactionRepository.findOneBy({ id: transfer.to.id })).toMatchObject({ merchant: null, note: null, tags: [] })
        })

        it('should not update the other transactions', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)
            const otherTransaction = await createTransaction(ctx, user, account)

            await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ amount: 1 })

            expect(await transactionRepository.findOneBy({ id: otherTransaction.id })).toMatchObject({ amount: -4250 })
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['amount', 0],
            ['amount', 15.5],
            ['amount', '-4250'],
            ['amount', 2147483648],
            ['amount', null],
            ['occurredOn', null],
            ['occurredOn', '2026-02-30'],
            ['occurredOn', '2026-10-30T10:00:00Z'],
            ['accountId', null],
            ['accountId', 'toto'],
            ['categoryId', 'toto'],
            ['merchant', ''],
            ['note', ''],
            ['tags', null],
            ['tags', ['']],
            ['tags', ['a'.repeat(31)]],
            ['tags', Array.from({ length: 11 }, (_, index) => `tag${index}`)],
            ['sourceType', TransactionSourceType.PROVISION],
            ['provisionId', UNKNOWN_ID],
            ['installmentId', UNKNOWN_ID],
            ['savingsGoalId', UNKNOWN_ID],
            ['transferId', UNKNOWN_ID],
            ['status', TransactionStatus.PENDING],
            ['fixedChargeId', UNKNOWN_ID],
            ['incomeId', UNKNOWN_ID],
            ['userId', UNKNOWN_ID],
            ['id', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject({ ...TRANSACTION_DEFAULTS, accountId: account.id, sourceType: TransactionSourceType.MANUAL })
        })

        it.each([
            ['amount', -6000],
            ['occurredOn', '2026-11-05'],
            ['accountId', 'other-account'],
            ['categoryId', 'category'],
            ['categoryId', null],
        ])('should throw conflict and keep both transactions of a transfer when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions' })
            const otherAccount = await createAccount(ctx, user, { name: 'Wave' })
            const category = await createCategory(ctx, user)
            const transfer = await createTransfer(ctx, user, account, provisionsAccount)
            const resolved = { 'other-account': otherAccount.id, category: category.id }[value as string] ?? value

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transfer.to.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: resolved })

            expect(response.statusCode).toBe(409)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSFER_NOT_EDITABLE)
            expect(await transactionRepository.findOneBy({ id: transfer.from.id })).toMatchObject({ amount: -5834, occurredOn: '2026-11-01', accountId: account.id, categoryId: null })
            expect(await transactionRepository.findOneBy({ id: transfer.to.id })).toMatchObject({ amount: 5834, occurredOn: '2026-11-01', accountId: provisionsAccount.id, categoryId: null })
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/transactions/toto')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ amount: 1 })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when transaction does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ amount: 1 })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
        })

        it('should throw not found and keep the transaction when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const otherTransaction = await createTransaction(ctx, otherUser, otherAccount)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${otherTransaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ amount: 1 })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND)
            expect(await transactionRepository.findOneBy({ id: otherTransaction.id })).toMatchObject({ amount: -4250 })
        })

        it.each([
            ['account does not exist', 'accountId', ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND],
            ['category does not exist', 'categoryId', ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND],
        ])('should throw not found when %s', async (_, field, message) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(message)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject({ ...TRANSACTION_DEFAULTS, accountId: account.id })
        })

        it('should throw not found and keep the account when the new account belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const account = await createAccount(ctx, user)
            const otherAccount = await createAccount(ctx, otherUser)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ accountId: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject({ accountId: account.id })
        })

        it('should throw not found and keep the category when the new category belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const account = await createAccount(ctx, user)
            const otherCategory = await createCategory(ctx, otherUser)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ categoryId: otherCategory.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject({ categoryId: null })
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .send({ amount: 1 })

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject({ amount: -4250 })
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')
                .send({ amount: 1 })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send({ amount: 1 })

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject({ amount: -4250 })
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send({ amount: 1 })

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.findOneBy({ id: transaction.id })).toMatchObject({ amount: -4250 })
        })
    })
})
