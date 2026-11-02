import { Account } from "src/modules/accounts/account.entity";
import { FixedCharge } from "src/modules/fixed-charges/fixed-charge.entity";
import { Income } from "src/modules/incomes/income.entity";
import { InstallmentPlan } from "src/modules/installment-plans/installment-plan.entity";
import { PlanningService } from "src/modules/planning/planning.service";
import { Provision } from "src/modules/provisions/provision.entity";
import { SavingsGoal } from "src/modules/savings-goals/savings-goal.entity";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "src/modules/transactions/types";
import { User } from "src/modules/users/user.entity";
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createFixedCharge, createIncome, createInstallmentPlan, createProvision, createSavingsGoal, createTransaction, createUserAndLogin } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('Planning generation', () => {
    let ctx: TestContext;
    let planningService: PlanningService;
    let transactionRepository: Repository<Transaction>;

    const today = new Date('2026-11-02T00:05:00Z')
    // The rules exist before the generated month whatever the day the tests run
    const createdAt = new Date('2026-01-01T10:00:00Z')

    beforeAll(async () => {
        ctx = await createTestApp()
        planningService = ctx.moduleRef.get(PlanningService)
        transactionRepository = ctx.repo(Transaction)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    /**
     * A user paid on the primary account who funds a provisions account and a savings account
     */
    const setup = async (email?: string) => {
        const { user } = await createUserAndLogin(ctx, email ? { email } : {})
        const primary = await createAccount(ctx, user, { name: 'Compte salaire', isPrimary: true, createdAt })
        const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions', createdAt })
        const livret = await createAccount(ctx, user, { name: 'Livret A', createdAt })
        const income = await createIncome(ctx, user, { dayOfMonth: 28, createdAt })
        const fixedCharge = await createFixedCharge(ctx, user, { createdAt })
        const plan = await createInstallmentPlan(ctx, user, { createdAt })
        const provision = await createProvision(ctx, user, { accountId: provisionsAccount.id, createdAt })
        const savingsGoal = await createSavingsGoal(ctx, user, { accountId: livret.id, createdAt })

        return { user, primary, provisionsAccount, livret, income, fixedCharge, plan, provision, savingsGoal }
    }

    const findTransactions = (user: User): Promise<Transaction[]> => transactionRepository.find({ where: { userId: user.id }, order: { occurredOn: 'ASC', amount: 'ASC' } })

    describe('Success cases', () => {
        it('should generate the pending transactions of the month and move the cursors', async () => {
            const { user, primary, provisionsAccount, livret, income, fixedCharge, plan, provision, savingsGoal } = await setup()

            const generated = await planningService.generateForUser(user.id!, today)

            const transactions = await findTransactions(user)
            const pending = { status: TransactionStatus.PENDING, userId: user.id }
            expect(generated).toEqual(7)
            expect(transactions).toEqual([
                expect.objectContaining({ ...pending, amount: -85000, occurredOn: '2026-11-05', accountId: primary.id, sourceType: TransactionSourceType.FIXED_CHARGE, fixedChargeId: fixedCharge.id, merchant: 'Loyer' }),
                expect.objectContaining({ ...pending, amount: -18750, occurredOn: '2026-11-15', accountId: primary.id, sourceType: TransactionSourceType.INSTALLMENT, installmentId: plan.installments[0].id, merchant: 'iPhone 15 1/4' }),
                expect.objectContaining({ ...pending, amount: -20000, occurredOn: '2026-11-28', accountId: primary.id, sourceType: TransactionSourceType.TRANSFER, savingsGoalId: savingsGoal.id }),
                expect.objectContaining({ ...pending, amount: -5834, occurredOn: '2026-11-28', accountId: primary.id, sourceType: TransactionSourceType.TRANSFER, provisionId: provision.id }),
                expect.objectContaining({ ...pending, amount: 5834, occurredOn: '2026-11-28', accountId: provisionsAccount.id, sourceType: TransactionSourceType.TRANSFER, provisionId: provision.id }),
                expect.objectContaining({ ...pending, amount: 20000, occurredOn: '2026-11-28', accountId: livret.id, sourceType: TransactionSourceType.TRANSFER, savingsGoalId: savingsGoal.id }),
                expect.objectContaining({ ...pending, amount: 248000, occurredOn: '2026-11-28', accountId: primary.id, sourceType: TransactionSourceType.INCOME, incomeId: income.id, merchant: 'Salaire' }),
            ])

            const provisionLegs = transactions.filter(({ provisionId }) => provisionId === provision.id)
            expect(provisionLegs[0].transferId).toEqual(provisionLegs[1].transferId)

            for (const entity of [Income, FixedCharge, InstallmentPlan, Provision, SavingsGoal]) {
                expect(await ctx.repo(entity).findOneBy({ userId: user.id })).toEqual(expect.objectContaining({ lastGeneratedMonth: '2026-11' }))
            }
        })

        it('should fund an account from the primary account and move its cursor', async () => {
            const { user } = await createUserAndLogin(ctx)
            const primary = await createAccount(ctx, user, { isPrimary: true, createdAt })
            const daily = await createAccount(ctx, user, { name: 'Dépenses courantes', monthlyFunding: 60000, monthlyFundingDay: 3, createdAt })

            await planningService.generateForUser(user.id!, today)

            expect(await findTransactions(user)).toEqual([
                expect.objectContaining({ amount: -60000, occurredOn: '2026-11-03', accountId: primary.id, sourceType: TransactionSourceType.TRANSFER, status: TransactionStatus.PENDING }),
                expect.objectContaining({ amount: 60000, occurredOn: '2026-11-03', accountId: daily.id, sourceType: TransactionSourceType.TRANSFER, status: TransactionStatus.PENDING }),
            ])
            expect(await ctx.repo(Account).findOneBy({ id: daily.id })).toEqual(expect.objectContaining({ lastGeneratedMonth: '2026-11' }))
            expect(await ctx.repo(Account).findOneBy({ id: primary.id })).toEqual(expect.objectContaining({ lastGeneratedMonth: null }))
        })

        it('should not generate twice when run again in the month', async () => {
            const { user } = await setup()
            await planningService.generateForUser(user.id!, today)

            const generated = await planningService.generateForUser(user.id!, new Date('2026-11-20T00:05:00Z'))

            expect(generated).toEqual(0)
            expect(await transactionRepository.countBy({ userId: user.id })).toEqual(7)
        })

        it('should not generate twice when two runs overlap', async () => {
            const { user } = await setup()

            const results = await Promise.all([
                planningService.generateForUser(user.id!, today),
                planningService.generateForUser(user.id!, today),
            ])

            expect(results.sort()).toEqual([0, 7])
            expect(await transactionRepository.countBy({ userId: user.id })).toEqual(7)
        })

        it('should not generate again a pending transaction deleted by the user', async () => {
            const { user, fixedCharge } = await setup()
            await planningService.generateForUser(user.id!, today)
            await transactionRepository.delete({ fixedChargeId: fixedCharge.id })

            await planningService.generateForUser(user.id!, new Date('2026-11-03T00:05:00Z'))

            expect(await transactionRepository.countBy({ fixedChargeId: fixedCharge.id })).toEqual(0)
        })

        it('should generate a rule added later in the month on the next run', async () => {
            const { user } = await setup()
            await planningService.generateForUser(user.id!, today)
            const internet = await createFixedCharge(ctx, user, { label: 'Internet', amount: 2999, dayOfMonth: 20, createdAt: new Date('2026-11-10T09:00:00Z') })

            const generated = await planningService.generateForUser(user.id!, new Date('2026-11-11T00:05:00Z'))

            expect(generated).toEqual(1)
            expect(await transactionRepository.findOneBy({ fixedChargeId: internet.id })).toEqual(expect.objectContaining({ amount: -2999, occurredOn: '2026-11-20', status: TransactionStatus.PENDING }))
        })

        it('should keep open a provision with nothing to generate this month', async () => {
            const { user } = await createUserAndLogin(ctx)
            await createAccount(ctx, user, { isPrimary: true, createdAt })
            const provision = await createProvision(ctx, user, { nextDueDate: '2026-12-15', createdAt })
            await planningService.generateForUser(user.id!, today)
            await ctx.repo(Provision).update(provision.id!, { nextDueDate: '2026-11-20' })

            const generated = await planningService.generateForUser(user.id!, new Date('2026-11-11T00:05:00Z'))

            expect(generated).toEqual(1)
            expect(await transactionRepository.findOneBy({ provisionId: provision.id })).toEqual(expect.objectContaining({ amount: -70000, occurredOn: '2026-11-20', sourceType: TransactionSourceType.PROVISION }))
        })

        it('should move the next due date of a provision forward once its payment is generated', async () => {
            const { user } = await createUserAndLogin(ctx)
            const primary = await createAccount(ctx, user, { isPrimary: true, createdAt })
            const provisionsAccount = await createAccount(ctx, user, { name: 'Provisions', createdAt })
            const provision = await createProvision(ctx, user, { accountId: provisionsAccount.id, nextDueDate: '2026-11-15', startedAt: '2026-01-01', createdAt })

            await planningService.generateForUser(user.id!, today)

            expect(await transactionRepository.findOneBy({ provisionId: provision.id, sourceType: TransactionSourceType.PROVISION })).toEqual(expect.objectContaining({ amount: -70000, occurredOn: '2026-11-15', accountId: provisionsAccount.id, status: TransactionStatus.PENDING }))
            expect(await transactionRepository.countBy({ provisionId: provision.id, sourceType: TransactionSourceType.TRANSFER })).toEqual(2)
            expect(await ctx.repo(Provision).findOneBy({ id: provision.id })).toEqual(expect.objectContaining({ nextDueDate: '2027-11-15', lastGeneratedMonth: '2026-11' }))
            expect(await transactionRepository.countBy({ accountId: primary.id })).toEqual(1)
        })

        it('should not generate an installment already paid', async () => {
            const { user } = await createUserAndLogin(ctx)
            const primary = await createAccount(ctx, user, { isPrimary: true, createdAt })
            const plan = await createInstallmentPlan(ctx, user, { createdAt })
            await createTransaction(ctx, user, primary, { amount: -18750, occurredOn: '2026-11-01', sourceType: TransactionSourceType.INSTALLMENT, installmentId: plan.installments[0].id })

            const generated = await planningService.generateForUser(user.id!, today)

            expect(generated).toEqual(0)
            expect(await transactionRepository.countBy({ userId: user.id })).toEqual(1)
            expect(await ctx.repo(InstallmentPlan).findOneBy({ id: plan.id })).toEqual(expect.objectContaining({ lastGeneratedMonth: null }))
        })

        it('should purge the pending transactions dated before the previous month only', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { isPrimary: true })
            const stale = await createTransaction(ctx, user, account, { occurredOn: '2026-09-30', status: TransactionStatus.PENDING })
            const previousMonth = await createTransaction(ctx, user, account, { occurredOn: '2026-10-01', status: TransactionStatus.PENDING })
            const confirmed = await createTransaction(ctx, user, account, { occurredOn: '2026-08-15' })

            const purged = await planningService.purgeStalePending(today)

            expect(purged).toEqual(1)
            expect(await transactionRepository.findOneBy({ id: stale.id })).toBeNull()
            expect(await transactionRepository.findOneBy({ id: previousMonth.id })).not.toBeNull()
            expect(await transactionRepository.findOneBy({ id: confirmed.id })).not.toBeNull()
        })

        it('should generate for every user with a primary account', async () => {
            const { user } = await setup()
            const { user: otherUser } = await setup('other@gmail.com')
            const { user: userWithoutPrimary } = await createUserAndLogin(ctx, { email: 'third@gmail.com' })
            await createAccount(ctx, userWithoutPrimary, { createdAt })
            await createIncome(ctx, userWithoutPrimary, { dayOfMonth: 28, createdAt })

            await planningService.generateAll(today)

            expect(await transactionRepository.countBy({ userId: user.id })).toEqual(7)
            expect(await transactionRepository.countBy({ userId: otherUser.id })).toEqual(7)
            expect(await transactionRepository.countBy({ userId: userWithoutPrimary.id })).toEqual(0)
        })
    })

    describe('Failure cases', () => {
        it('should generate nothing for a user without primary account', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user, { createdAt })
            await createIncome(ctx, user, { dayOfMonth: 28, accountId: account.id, createdAt })

            const generated = await planningService.generateForUser(user.id!, today)

            expect(generated).toEqual(0)
            expect(await transactionRepository.countBy({ userId: user.id })).toEqual(0)
        })

        it('should generate nothing for an unknown user', async () => {
            const generated = await planningService.generateForUser('00000000-0000-0000-0000-000000000000', today)

            expect(generated).toEqual(0)
        })
    })
})
