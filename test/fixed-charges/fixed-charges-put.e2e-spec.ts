import { ERRORS_MESSAGES } from "src/common/constants";
import { FixedCharge } from "src/modules/fixed-charges/fixed-charge.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createFixedCharge, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('PUT fixed-charges/:id', () => {
    let ctx: TestContext;
    let fixedChargeRepository: Repository<FixedCharge>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'
    const FIXED_CHARGE_DEFAULTS = { label: 'Loyer', amount: 85000, dayOfMonth: 5, accountId: null, categoryId: null }

    beforeAll(async () => {
        ctx = await createTestApp()
        fixedChargeRepository = ctx.repo(FixedCharge)
    })

    beforeEach(async () => {
        await resetDatabase(ctx.dataSource)
    })

    afterAll(async () => {
        await ctx.app.close()
    })

    describe('Success cases', () => {
        it('should update all the fields and return the fixed charge', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const fixedCharge = await createFixedCharge(ctx, user)
            const body = { label: 'Netflix', amount: 1399, dayOfMonth: 31, accountId: account.id, categoryId: category.id }

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send(body)

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toStrictEqual({
                id: fixedCharge.id,
                ...body,
                createdAt: fixedCharge.createdAt!.toISOString(),
            })
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject(body)
        })

        it.each([
            ['label', 'Netflix'],
            ['amount', 1],
            ['amount', 2147483647],
            ['dayOfMonth', 1],
            ['dayOfMonth', 31],
        ])('should only update %s to %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...FIXED_CHARGE_DEFAULTS, [field]: value })
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject({ ...FIXED_CHARGE_DEFAULTS, [field]: value })
        })

        it('should unlink the account and the category when they are null', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const fixedCharge = await createFixedCharge(ctx, user, { accountId: account.id, categoryId: category.id })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ accountId: null, categoryId: null })

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject(FIXED_CHARGE_DEFAULTS)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject(FIXED_CHARGE_DEFAULTS)
        })

        it('should leave the fixed charge unchanged when body is empty', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const category = await createCategory(ctx, user)
            const fixedCharge = await createFixedCharge(ctx, user, { categoryId: category.id })

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({})

            expect(response.statusCode).toBe(200)
            expect(response.body.data).toMatchObject({ ...FIXED_CHARGE_DEFAULTS, categoryId: category.id })
        })

        it('should not update the other fixed charges', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)
            const otherFixedCharge = await createFixedCharge(ctx, user, { label: 'Netflix' })

            await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ amount: 1 })

            expect(await fixedChargeRepository.findOneBy({ id: otherFixedCharge.id })).toMatchObject({ label: 'Netflix', amount: 85000 })
        })
    })

    describe('Failure cases', () => {
        it.each([
            ['label', ''],
            ['label', 123],
            ['label', null],
            ['amount', 0],
            ['amount', -1],
            ['amount', 15.5],
            ['amount', '85000'],
            ['amount', 2147483648],
            ['amount', null],
            ['dayOfMonth', null],
            ['dayOfMonth', 0],
            ['dayOfMonth', 32],
            ['dayOfMonth', '5'],
            ['accountId', 'toto'],
            ['categoryId', 'toto'],
        ])('should throw bad request when %s is %p', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject(FIXED_CHARGE_DEFAULTS)
        })

        it.each([
            ['userId', UNKNOWN_ID],
            ['id', UNKNOWN_ID],
        ])('should throw bad request when %s is sent', async (field, value) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Netflix', [field]: value })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject({ ...FIXED_CHARGE_DEFAULTS, userId: user.id })
        })

        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put('/api/v1/fixed-charges/toto')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Netflix' })

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when fixed charge does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Netflix' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.FIXED_CHARGES.FIXED_CHARGE_NOT_FOUND)
        })

        it('should throw not found and keep the fixed charge when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherFixedCharge = await createFixedCharge(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${otherFixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ label: 'Netflix' })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.FIXED_CHARGES.FIXED_CHARGE_NOT_FOUND)
            expect(await fixedChargeRepository.findOneBy({ id: otherFixedCharge.id })).toMatchObject(FIXED_CHARGE_DEFAULTS)
        })

        it.each([
            ['account does not exist', 'accountId', ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND],
            ['category does not exist', 'categoryId', ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND],
        ])('should throw not found when %s', async (_, field, message) => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ [field]: UNKNOWN_ID })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(message)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject(FIXED_CHARGE_DEFAULTS)
        })

        it('should throw not found and keep the fixed charge unlinked when account belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherAccount = await createAccount(ctx, otherUser)
            const fixedCharge = await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ accountId: otherAccount.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject(FIXED_CHARGE_DEFAULTS)
        })

        it('should throw not found and keep the fixed charge unlinked when category belongs to another user', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherCategory = await createCategory(ctx, otherUser)
            const fixedCharge = await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ categoryId: otherCategory.id })

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject(FIXED_CHARGE_DEFAULTS)
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .send({ label: 'Netflix' })

            expect(response.statusCode).toBe(401)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject(FIXED_CHARGE_DEFAULTS)
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')
                .send({ label: 'Netflix' })

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)
                .send({ label: 'Netflix' })

            expect(response.statusCode).toBe(401)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject(FIXED_CHARGE_DEFAULTS)
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .put(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)
                .send({ label: 'Netflix' })

            expect(response.statusCode).toBe(401)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toMatchObject(FIXED_CHARGE_DEFAULTS)
        })
    })
})
