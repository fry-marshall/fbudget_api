import * as bcrypt from "bcrypt";
import { getTokenExpiry } from "src/common/helpers/helpers";
import { Account } from "src/modules/accounts/account.entity";
import { AccountType } from "src/modules/accounts/types";
import { Category } from "src/modules/categories/category.entity";
import { CategoryType } from "src/modules/categories/types";
import { Income } from "src/modules/incomes/income.entity";
import { FixedCharge } from "src/modules/fixed-charges/fixed-charge.entity";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { Provision } from "src/modules/provisions/provision.entity";
import { InstallmentPlan } from "src/modules/installment-plans/installment-plan.entity";
import { Installment } from "src/modules/installment-plans/installment.entity";
import { buildInstallments } from "src/modules/installment-plans/installment-plan.helpers";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import { DeepPartial } from "typeorm";
import { TestContext } from "./test-app";

export const TEST_EMAIL = 'test@gmail.com';
export const OTP_CODE = '123456';
export const OTP_VALIDITY_MS = 15 * 60_000;

/**
 * Find a user with its otpCode column, which is not selected by default
 */
export const findUserWithOtp = (ctx: TestContext, email: string = TEST_EMAIL): Promise<User | null> => ctx.repo(User)
    .createQueryBuilder('user')
    .addSelect('user.otpCode')
    .where('user.email = :email', { email })
    .getOne()

/**
 * Read the plain OTP sent in the last mail
 */
export const getSentOtp = (mailServiceMocked: { sendMail: jest.Mock }): string => mailServiceMocked.sendMail.mock.lastCall[0].context.code

/**
 * Check the stored OTP is the bcrypt hash of the 6 digits code sent by mail and expires in ~15 minutes
 */
export const expectValidOtp = async (user: User | null, sentCode: string) => {
    expect(sentCode).toMatch(/^\d{6}$/)
    expect(user?.otpCode).not.toEqual(sentCode)
    expect(await bcrypt.compare(sentCode, user!.otpCode!)).toBe(true)

    const expiresIn = user!.otpExpiresAt!.getTime() - Date.now()
    expect(expiresIn).toBeGreaterThan(OTP_VALIDITY_MS - 60_000)
    expect(expiresIn).toBeLessThanOrEqual(OTP_VALIDITY_MS)
}

/**
 * Build a user with default values, ready to be saved with its settings
 */
export const buildUser = (overrides: DeepPartial<User> = {}): DeepPartial<User> => ({
    displayName: 'marshall',
    email: TEST_EMAIL,
    authProviders: [AuthProvider.EMAIL],
    settings: {},
    ...overrides
})

/**
 * Save a user with a pending OTP stored hashed, the plain code to send is OTP_CODE
 */
export const createUserWithPendingOtp = async (ctx: TestContext, overrides: DeepPartial<User> = {}): Promise<User> => ctx.repo(User).save(buildUser({
    otpCode: await bcrypt.hash(OTP_CODE, 4),
    otpExpiresAt: new Date(Date.now() + 100000),
    ...overrides
}))

/**
 * Sign an access token the same way as AuthService
 */
export const signAccessToken = (
    { jwtService, configService }: TestContext,
    user: User,
    expiresIn: string | number = configService.get('ACCESS_TOKEN_EXPIRY')!
): string => jwtService.sign(
    { id: user.id, email: user.email },
    { secret: configService.get('ACCESS_TOKEN_SECRET'), expiresIn: expiresIn as any }
)

/**
 * Sign a refresh token the same way as AuthService
 */
export const signRefreshToken = (
    { jwtService, configService }: TestContext,
    user: User,
    expiresIn: string | number = configService.get('REFRESH_TOKEN_EXPIRY')!
): string => jwtService.sign(
    { id: user.id, email: user.email },
    { secret: configService.get('REFRESH_TOKEN_SECRET'), expiresIn: expiresIn as any }
)

/**
 * Save a user with a refresh token stored in database, as if they had just logged in
 */
export const createUserAndLogin = async (
    ctx: TestContext,
    overrides: DeepPartial<User> = {}
): Promise<{ user: User, accessToken: string, refreshToken: string }> => {
    const user = await ctx.repo(User).save(buildUser(overrides))

    const refreshToken = signRefreshToken(ctx, user)
    await ctx.repo(RefreshToken).save({
        token: refreshToken,
        expiresAt: getTokenExpiry(ctx.jwtService, refreshToken),
        user: { id: user.id }
    })

    return { user, accessToken: signAccessToken(ctx, user), refreshToken }
}

export const createAccount = (ctx: TestContext, user: User, overrides: DeepPartial<Account> = {}): Promise<Account> => ctx.repo(Account).save({
    type: AccountType.CARD,
    name: 'Visa *4782',
    initialBalance: 150000,
    userId: user.id,
    ...overrides
})

export const createCategory = (ctx: TestContext, user: User, overrides: DeepPartial<Category> = {}): Promise<Category> => ctx.repo(Category).save({
    type: CategoryType.GROCERIES,
    userId: user.id,
    ...overrides
})

export const createIncome = (ctx: TestContext, user: User, overrides: DeepPartial<Income> = {}): Promise<Income> => ctx.repo(Income).save({
    label: 'Salaire',
    amount: 248000,
    userId: user.id,
    ...overrides
})

export const createFixedCharge = (ctx: TestContext, user: User, overrides: DeepPartial<FixedCharge> = {}): Promise<FixedCharge> => ctx.repo(FixedCharge).save({
    label: 'Loyer',
    amount: 85000,
    dayOfMonth: 5,
    userId: user.id,
    ...overrides
})

export const createTransaction = (ctx: TestContext, user: User, account: Account, overrides: DeepPartial<Transaction> = {}): Promise<Transaction> => ctx.repo(Transaction).save({
    amount: -4250,
    occurredOn: '2026-10-15',
    accountId: account.id,
    userId: user.id,
    ...overrides
})

export const createProvision = (ctx: TestContext, user: User, overrides: DeepPartial<Provision> = {}): Promise<Provision> => ctx.repo(Provision).save({
    label: 'Assurance auto',
    totalAmount: 70000,
    frequencyMonths: 12,
    nextDueDate: '2027-03-15',
    startedAt: '2026-11-01',
    userId: user.id,
    ...overrides
})

/**
 * Save an installment plan with its generated installments, ordered by index
 */
export const createInstallmentPlan = async (ctx: TestContext, user: User, overrides: DeepPartial<InstallmentPlan> = {}): Promise<InstallmentPlan & { installments: Installment[] }> => {
    const plan = await ctx.repo(InstallmentPlan).save({
        label: 'iPhone 15',
        provider: 'Klarna',
        totalAmount: 75000,
        installmentCount: 4,
        firstDueDate: '2026-11-15',
        userId: user.id,
        ...overrides
    })
    const installments = await ctx.repo(Installment).save(
        buildInstallments(plan.totalAmount!, plan.installmentCount!, plan.firstDueDate!).map((installment) => ({ ...installment, planId: plan.id }))
    )

    return { ...plan, installments }
}
