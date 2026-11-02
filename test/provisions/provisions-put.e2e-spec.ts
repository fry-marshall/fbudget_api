import { ERRORS_MESSAGES } from "src/common/constants";
import { Provision } from "src/modules/provisions/provision.entity";
import { ProvisionStatus } from "src/modules/provisions/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createProvision, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT provisions/:id', () => {
    let ctx: TestContext;
    let provisionRepository: Repository<Provision>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const PROVISION_DEFAULTS = { label: 'Assurance auto', totalAmount: 70000, frequencyMonths: 12, nextDueDate: '2027-03-15', startedAt: '2026-11-01', status: ProvisionStatus.ACTIVE, accountId: null, categoryId: null }

    beforeAll(async () => {
        ctx = await createTestApp()
        provisionRepository = ctx.repo(Provision)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should update all the fields and return the provision with its new monthly amount', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const provision = await createProvision(ctx, user)
            const body = { label: 'Dentiste', totalAmount: 15000, frequencyMonths: 6, nextDueDate: '2027-01-20', startedAt: '2026-10-01', status: ProvisionStatus.PAUSED, accountId: account.id, categoryId: category.id }

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                id: provision.id,
                ...body,
                monthlyAmount: 2500,
                reservedAmount: 0,
                progressPct: 0,
                createdAt: provision.createdAt!.toISOString(),
            })
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject(body)
        })

        it.each([
            ['postpone the due date', 'nextDueDate', '2027-04-30'],
            ['bring the due date forward', 'nextDueDate', '2027-01-01'],
            ['pause the provision', 'status', ProvisionStatus.PAUSED],
            ['cancel the provision', 'status', ProvisionStatus.CANCELLED],
            ['rename the provision', 'label', 'Assurance moto'],
        ])('should %s', async (_, field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...PROVISION_DEFAULTS, [field]: value })
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject({ ...PROVISION_DEFAULTS, [field]: value })
        })

        it('should resume a paused provision', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user, { status: ProvisionStatus.PAUSED })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ status: ProvisionStatus.ACTIVE })

            expect(response.statusCode).toBe(200)
            expect(response.body.data.status).toBe(ProvisionStatus.ACTIVE)
        })

        it('should unlink the account and the category when they are null', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const provision = await createProvision(ctx, user, { accountId: account.id, categoryId: category.id })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ accountId: null, categoryId: null })

            expect(response.statusCode).toBe(200)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject(PROVISION_DEFAULTS)
        })

        it('should leave the provision unchanged when body is empty', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject(PROVISION_DEFAULTS)
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['label', ''],
            ['label', null],
            ['totalAmount', 0],
            ['totalAmount', '70000'],
            ['totalAmount', null],
            ['frequencyMonths', 1],
            ['frequencyMonths', 61],
            ['frequencyMonths', null],
            ['nextDueDate', null],
            ['nextDueDate', '2027-02-30'],
            ['startedAt', null],
            ['status', 'done'],
            ['status', null],
            ['accountId', 'toto'],
            ['categoryId', 'toto'],
            ['monthlyAmount', 1],
            ['userId', UNKNOWN_ID],
            ['id', UNKNOWN_ID],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject(PROVISION_DEFAULTS)
        })

        it.each([
            ['resume', { status: ProvisionStatus.ACTIVE }],
            ['rename', { label: 'Assurance moto' }],
            ['postpone', { nextDueDate: '2027-04-30' }],
        ])('should throw conflict when trying to %s a cancelled provision', async (_, body) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user, { status: ProvisionStatus.CANCELLED })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(409)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.PROVISION_CANCELLED)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject({ ...PROVISION_DEFAULTS, status: ProvisionStatus.CANCELLED })
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/provisions/toto')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Dentiste' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when provision does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Dentiste' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND)
        })

        it('should throw not found and keep the provision when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherProvision = await createProvision(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${otherProvision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Dentiste' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND)
            expect(await provisionRepository.findOneBy({ id: otherProvision.id })).toMatchObject(PROVISION_DEFAULTS)
        })

        it('should throw not found when the new account belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ accountId: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject(PROVISION_DEFAULTS)
        })

        it('should throw not found when the new category belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherCategory = await createCategory(ctx, otherUser)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ categoryId: otherCategory.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject(PROVISION_DEFAULTS)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .send({ label: 'Dentiste' })

            expect(response.statusCode).toBe(401)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject(PROVISION_DEFAULTS)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')
                .send({ label: 'Dentiste' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send({ label: 'Dentiste' })

            expect(response.statusCode).toBe(401)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject(PROVISION_DEFAULTS)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send({ label: 'Dentiste' })

            expect(response.statusCode).toBe(401)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toMatchObject(PROVISION_DEFAULTS)
        })
    })
})
