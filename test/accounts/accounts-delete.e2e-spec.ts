import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "src/modules/accounts/account.entity";
import { Income } from "src/modules/incomes/income.entity";
import { FixedCharge } from "src/modules/fixed-charges/fixed-charge.entity";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { Provision } from "src/modules/provisions/provision.entity";
import { User } from "src/modules/users/user.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createFixedCharge, createIncome, createProvision, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('DELETE accounts/:id', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let accountRepository: Repository<Account>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

    beforeAll(async () => {
        ctx = await createTestApp()
        userRepository = ctx.repo(User)
        accountRepository = ctx.repo(Account)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should delete the account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.message).toBe(SUCCESS_MESSAGES.ACCOUNT.ACCOUNT_DELETED)
            expect(await accountRepository.findOneBy({ id: account.id })).toBeNull()
            expect(await userRepository.findOneBy({ id: user.id })).not.toBeNull()
        })

        it('should keep the incomes of the account without account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const income = await createIncome(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await ctx.repo(Income).findOneBy({ id: income.id })).toMatchObject({ accountId: null, label: 'Salaire' })
        })

        it('should keep the fixed charges of the account without account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const fixedCharge = await createFixedCharge(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await ctx.repo(FixedCharge).findOneBy({ id: fixedCharge.id })).toMatchObject({ accountId: null, label: 'Loyer' })
        })

        it('should keep the transactions of the account without account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const transaction = await createTransaction(ctx, user, account)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await ctx.repo(Transaction).findOneBy({ id: transaction.id })).toMatchObject({ accountId: null, amount: -4250 })
        })

        it('should keep the provisions of the account without account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await ctx.repo(Provision).findOneBy({ id: provision.id })).toMatchObject({ accountId: null, label: 'Assurance auto' })
        })

        it('should keep the primary account when deleting a secondary account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primaryAccount = await createAccount(ctx, user, { isPrimary: true })
            const secondaryAccount = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${secondaryAccount.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await accountRepository.findOneBy({ id: primaryAccount.id })).toMatchObject({ isPrimary: true })
        })

        it('should make the oldest remaining account primary when deleting the primary account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primaryAccount = await createAccount(ctx, user, { isPrimary: true })
            const oldestAccount = await createAccount(ctx, user, { name: 'Oldest' })
            const newestAccount = await createAccount(ctx, user, { name: 'Newest' })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${primaryAccount.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await accountRepository.findOneBy({ id: oldestAccount.id })).toMatchObject({ isPrimary: true })
            expect(await accountRepository.findOneBy({ id: newestAccount.id })).toMatchObject({ isPrimary: false })
        })

        it('should leave the user without account when deleting the last one', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { isPrimary: true })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await accountRepository.countBy({ userId: user.id })).toEqual(0)
        })

        it('should keep exactly one primary account when deleting accounts in parallel', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const primaryAccount = await createAccount(ctx, user, { isPrimary: true })
            const secondAccount = await createAccount(ctx, user)
            await createAccount(ctx, user)

            const responses = await Promise.all([primaryAccount, secondAccount].map((account) => request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
            ))

            expect(responses.map((response) => response.statusCode)).toEqual([200, 200])
            expect(await accountRepository.countBy({ userId: user.id })).toEqual(1)
            expect(await accountRepository.countBy({ userId: user.id, isPrimary: true })).toEqual(1)
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/accounts/toto')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when account does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        })

        it('should throw not found when account is already deleted', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const firstResponse = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
            const secondResponse = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(firstResponse.statusCode).toBe(200)
            expect(secondResponse.statusCode).toBe(404)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        })

        it('should throw not found and keep the account when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser, { isPrimary: true })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${otherAccount.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await accountRepository.findOneBy({ id: otherAccount.id })).toMatchObject({ isPrimary: true })
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.findOneBy({ id: account.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.findOneBy({ id: account.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/accounts/${account.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await accountRepository.findOneBy({ id: account.id })).not.toBeNull()
        })
    })
})
