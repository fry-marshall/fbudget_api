import { Account } from "src/modules/accounts/account.entity";
import { Category } from "src/modules/categories/category.entity";
import { CategoryType } from "src/modules/categories/types";
import { Income } from "src/modules/incomes/income.entity";
import { FixedCharge } from "src/modules/fixed-charges/fixed-charge.entity";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { Provision } from "src/modules/provisions/provision.entity";
import { InstallmentPlan } from "src/modules/installment-plans/installment-plan.entity";
import { Installment } from "src/modules/installment-plans/installment.entity";
import { SavingsGoal } from "src/modules/savings-goals/savings-goal.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { Settings } from "src/modules/settings/settings.entity";
import { AccountType } from "src/modules/accounts/types";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import { Repository } from "typeorm";
import request from 'supertest'
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createFixedCharge, createIncome, createInstallmentPlan, createProvision, createSavingsGoal, createTransaction, createTransfer, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('DELETE users/me', () => {
    let ctx: TestContext;
    let userRepository: Repository<User>;
    let refreshTokenRepository: Repository<RefreshToken>;
    let settingsRepository: Repository<Settings>;
    let accountRepository: Repository<Account>;
    let categoryRepository: Repository<Category>;
    let incomeRepository: Repository<Income>;
    let fixedChargeRepository: Repository<FixedCharge>;
    let transactionRepository: Repository<Transaction>;
    let provisionRepository: Repository<Provision>;

    beforeAll(async () => {
        ctx = await createTestApp()
        userRepository = ctx.repo(User)
        refreshTokenRepository = ctx.repo(RefreshToken)
        settingsRepository = ctx.repo(Settings)
        accountRepository = ctx.repo(Account)
        categoryRepository = ctx.repo(Category)
        incomeRepository = ctx.repo(Income)
        fixedChargeRepository = ctx.repo(FixedCharge)
        transactionRepository = ctx.repo(Transaction)
        provisionRepository = ctx.repo(Provision)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it.each([
            AuthProvider.EMAIL,
            AuthProvider.GOOGLE,
        ])('should delete the user registered with %s', async (authProvider) => {
            const { user, accessToken } = await createUserAndLogin(ctx, { authProviders: [authProvider] })

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toEqual(200)
            expect(response.body.data.message).toEqual(SUCCESS_MESSAGES.USER.USER_DELETED)
            expect(await userRepository.findOneBy({ id: user.id })).toBeNull()
            expect(await settingsRepository.count({ where: { user: { id: user.id } } })).toEqual(0)
            expect(await refreshTokenRepository.count({ where: { user: { id: user.id } } })).toEqual(0)
        })

        it('should permanently delete the user rows in database', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { isPrimary: true })
            await createAccount(ctx, user, { type: AccountType.MOBILE_MONEY, name: 'Wave' })
            await createCategory(ctx, user, { envelopeBudget: 14000 })
            await createCategory(ctx, user, { type: CategoryType.OTHER, label: 'Netflix' })
            await createIncome(ctx, user)
            await createFixedCharge(ctx, user)
            const provision = await createProvision(ctx, user)
            const plan = await createInstallmentPlan(ctx, user)
            await createTransaction(ctx, user, account, { installmentId: plan.installments[0].id })
            await createTransaction(ctx, user, account, { provisionId: provision.id })
            const savingsGoal = await createSavingsGoal(ctx, user, { accountId: account.id })
            await createSavingsGoal(ctx, user, { label: 'Livret A', targetAmount: null, targetDate: null })
            await createTransaction(ctx, user, account, { sourceType: TransactionSourceType.SAVINGS, savingsGoalId: savingsGoal.id })
            await createTransfer(ctx, user, account, await createAccount(ctx, user, { name: 'Provisions' }))

            await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            const [{ count }] = await ctx.dataSource.query('SELECT COUNT(*)::int AS count FROM users WHERE id = $1', [user.id])

            expect(count).toEqual(0)
            expect(await settingsRepository.count()).toEqual(0)
            expect(await refreshTokenRepository.count()).toEqual(0)
            expect(await accountRepository.count()).toEqual(0)
            expect(await categoryRepository.count()).toEqual(0)
            expect(await incomeRepository.count()).toEqual(0)
            expect(await fixedChargeRepository.count()).toEqual(0)
            expect(await transactionRepository.count()).toEqual(0)
            expect(await provisionRepository.count()).toEqual(0)
            expect(await ctx.repo(InstallmentPlan).count()).toEqual(0)
            expect(await ctx.repo(Installment).count()).toEqual(0)
            expect(await ctx.repo(SavingsGoal).count()).toEqual(0)
        })

        it('should keep the data of other users', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            await createCategory(ctx, otherUser)
            await createIncome(ctx, otherUser)
            await createFixedCharge(ctx, otherUser)
            await createTransaction(ctx, otherUser, otherAccount)
            await createProvision(ctx, otherUser)
            await createInstallmentPlan(ctx, otherUser)
            await createSavingsGoal(ctx, otherUser)

            await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(await userRepository.findOneBy({ id: otherUser.id })).not.toBeNull()
            expect(await settingsRepository.count({ where: { user: { id: otherUser.id } } })).toEqual(1)
            expect(await refreshTokenRepository.count({ where: { user: { id: otherUser.id } } })).toEqual(1)
            expect(await accountRepository.countBy({ userId: otherUser.id })).toEqual(1)
            expect(await categoryRepository.countBy({ userId: otherUser.id })).toEqual(1)
            expect(await incomeRepository.countBy({ userId: otherUser.id })).toEqual(1)
            expect(await fixedChargeRepository.countBy({ userId: otherUser.id })).toEqual(1)
            expect(await transactionRepository.countBy({ userId: otherUser.id })).toEqual(1)
            expect(await provisionRepository.countBy({ userId: otherUser.id })).toEqual(1)
            expect(await ctx.repo(InstallmentPlan).countBy({ userId: otherUser.id })).toEqual(1)
            expect(await ctx.repo(Installment).count()).toEqual(4)
            expect(await ctx.repo(SavingsGoal).countBy({ userId: otherUser.id })).toEqual(1)
        })

        it('should allow to sign up again with the email of a deleted user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)

            await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            const newUser = await userRepository.save({ email: user.email, settings: {} })

            expect(newUser.id).not.toBe(user.id)
            expect(await userRepository.countBy({ email: user.email })).toEqual(1)
        })
    })

    describe('Failure cases', () => {
        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized and keep the user when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await userRepository.findOneBy({ id: user.id })).not.toBeNull()
        })

        it('should throw unauthorized and keep the user when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await userRepository.findOneBy({ id: user.id })).not.toBeNull()
            expect(await refreshTokenRepository.count({ where: { user: { id: user.id } } })).toEqual(1)
        })

        it('should throw not found when user no longer exists', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            await userRepository.delete(user.id!)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when user is already deleted', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const firstResponse = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            const secondResponse = await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(firstResponse.statusCode).toBe(200)
            expect(secondResponse.statusCode).toBe(404)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when refreshing with the refresh token of a deleted user', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const accessToken = signAccessToken(ctx, user)

            await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/auth/refresh')
                .send({ refreshToken })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })

        it('should throw not found when getting me with the access token of a deleted user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            await request(ctx.app.getHttpServer())
                .delete('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            const response = await request(ctx.app.getHttpServer())
                .get('/api/v1/users/me')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        })
    })

})