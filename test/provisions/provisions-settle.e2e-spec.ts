import { ERRORS_MESSAGES } from "src/common/constants";
import { Provision } from "src/modules/provisions/provision.entity";
import { ProvisionStatus } from "src/modules/provisions/types";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "src/modules/transactions/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createProvision, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('POST provisions/:id/settle', () => {
    let ctx: TestContext;
    let provisionRepository: Repository<Provision>;
    let transactionRepository: Repository<Transaction>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const VALID_BODY = { occurredOn: '2027-03-14' }

    beforeAll(async () => {
        ctx = await createTestApp()
        provisionRepository = ctx.repo(Provision)
        transactionRepository = ctx.repo(Transaction)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should create the expense on the provision account and move the due date forward', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id, categoryId: category.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            const transactionCreated = await transactionRepository.findOneBy({ provisionId: provision.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data).toStrictEqual({
                provision: {
                    id: provision.id,
                    label: 'Assurance auto',
                    totalAmount: 70000,
                    frequencyMonths: 12,
                    monthlyAmount: 5834,
                    reservedAmount: -70000,
                    progressPct: 0,
                    nextDueDate: '2028-03-15',
                    startedAt: '2026-11-01',
                    status: ProvisionStatus.ACTIVE,
                    accountId: account.id,
                    categoryId: category.id,
                    createdAt: provision.createdAt!.toISOString(),
                },
                transaction: {
                    id: transactionCreated!.id,
                    amount: -70000,
                    occurredOn: '2027-03-14',
                    accountId: account.id,
                    categoryId: category.id,
                    merchant: 'Assurance auto',
                    note: null,
                    tags: [],
                    sourceType: TransactionSourceType.PROVISION,
                    provisionId: provision.id,
                    installmentId: null,
                    savingsGoalId: null,
                    transferId: null,
                    fixedChargeId: null,
                    incomeId: null,
                    status: TransactionStatus.CONFIRMED,
                    createdAt: transactionCreated!.createdAt!.toISOString(),
                },
            })
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject({ nextDueDate: '2028-03-15' })
        })

        it('should use the amount actually paid and the account sent', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provisionAccount = await createAccount(ctx, user)
            const otherAccount = await createAccount(ctx, user, { name: 'Wave' })
            const provision = await createProvision(ctx, user, { accountId: provisionAccount.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, amount: 72000, accountId: otherAccount.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.transaction).toMatchObject({ amount: -72000, accountId: otherAccount.id })
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject({ accountId: provisionAccount.id, totalAmount: 70000 })
        })

        it('should settle a provision without account when an account is sent', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: account.id })

            expect(response.statusCode).toBe(201)
            expect(response.body.data.transaction.accountId).toBe(account.id)
        })

        it('should settle a paused provision', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id, status: ProvisionStatus.PAUSED })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(201)
            expect(response.body.data.provision).toMatchObject({ status: ProvisionStatus.PAUSED, nextDueDate: '2028-03-15' })
        })

        it('should move a due date on a 31st to the last day of a shorter month', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id, frequencyMonths: 2, nextDueDate: '2026-12-31' })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.body.data.provision.nextDueDate).toBe('2027-02-28')
        })

        it('should move the due date forward once per settlement', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id, frequencyMonths: 2, nextDueDate: '2026-12-10' })

            for (let i = 0; i < 3; i++) {
                await request(ctx.app.getHttpServer())
                    .post(`/api/v1/provisions/${provision.id}/settle`)
                    .set('Authorization', `Bearer ${accessToken}`)
                    .send(VALID_BODY)
            }

            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject({ nextDueDate: '2027-06-10' })
            expect(await transactionRepository.countBy({ provisionId: provision.id })).toEqual(3)
        })

        it('should not lose a due date move when settling in parallel', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id, frequencyMonths: 2, nextDueDate: '2026-12-10' })

            const responses = await Promise.all(Array.from({ length: 3 }, () => request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)
            ))

            expect(responses.map((response) => response.statusCode)).toEqual([201, 201, 201])
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject({ nextDueDate: '2027-06-10' })
        })

        it('should lower the balance of the debited account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id })

            await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            const response = await request(ctx.app.getHttpServer())
                .get(`/api/v1/accounts/${account.id}/balance`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.body.data.balance).toBe(150000 - 70000)
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['occurredOn', undefined],
            ['occurredOn', '2027-02-30'],
            ['amount', 0],
            ['amount', -70000],
            ['amount', 15.5],
            ['amount', null],
            ['accountId', 'toto'],
            ['accountId', null],
            ['categoryId', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await transactionRepository.count()).toEqual(0)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject({ nextDueDate: '2027-03-15' })
        })

        it('should throw bad request when neither the provision nor the body has an account', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.ACCOUNT_REQUIRED)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw conflict when the provision is cancelled', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id, status: ProvisionStatus.CANCELLED })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(409)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.PROVISION_CANCELLED)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw not found and keep the due date when the account sent belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ ...VALID_BODY, accountId: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject({ nextDueDate: '2027-03-15' })
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post('/api/v1/provisions/toto/settle')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when provision does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${UNKNOWN_ID}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND)
        })

        it('should throw not found and create nothing when the provision belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const otherProvision = await createProvision(ctx, otherUser, { accountId: otherAccount.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${otherProvision.id}/settle`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${UNKNOWN_ID}/settle`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${UNKNOWN_ID}/settle`)
                .set('Authorization', 'Bearer toto')
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id })
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id })

            const response = await request(ctx.app.getHttpServer())
                .post(`/api/v1/provisions/${provision.id}/settle`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send(VALID_BODY)

            expect(response.statusCode).toBe(401)
            expect(await transactionRepository.count()).toEqual(0)
        })
    })
})
