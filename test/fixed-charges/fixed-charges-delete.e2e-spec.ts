import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "src/modules/accounts/account.entity";
import { Category } from "src/modules/categories/category.entity";
import { FixedCharge } from "src/modules/fixed-charges/fixed-charge.entity";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createCategory, createFixedCharge, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('DELETE fixed-charges/:id', () => {
    let ctx: TestContext;
    let fixedChargeRepository: Repository<FixedCharge>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

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
        it('should delete the fixed charge and keep the other ones, its account and its category', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const category = await createCategory(ctx, user)
            const fixedCharge = await createFixedCharge(ctx, user, { accountId: account.id, categoryId: category.id })
            const otherFixedCharge = await createFixedCharge(ctx, user, { label: 'Netflix' })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.message).toBe(SUCCESS_MESSAGES.FIXED_CHARGE.FIXED_CHARGE_DELETED)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).toBeNull()
            expect(await fixedChargeRepository.findOneBy({ id: otherFixedCharge.id })).not.toBeNull()
            expect(await ctx.repo(Account).findOneBy({ id: account.id })).not.toBeNull()
            expect(await ctx.repo(Category).findOneBy({ id: category.id })).not.toBeNull()
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/fixed-charges/toto')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when fixed charge does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/fixed-charges/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.FIXED_CHARGES.FIXED_CHARGE_NOT_FOUND)
        })

        it('should throw not found when fixed charge is already deleted', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)

            const firstResponse = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)
            const secondResponse = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(firstResponse.statusCode).toBe(200)
            expect(secondResponse.statusCode).toBe(404)
            expect(secondResponse.body.message).toBe(ERRORS_MESSAGES.FIXED_CHARGES.FIXED_CHARGE_NOT_FOUND)
        })

        it('should throw not found and keep the fixed charge when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherFixedCharge = await createFixedCharge(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/fixed-charges/${otherFixedCharge.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.FIXED_CHARGES.FIXED_CHARGE_NOT_FOUND)
            expect(await fixedChargeRepository.findOneBy({ id: otherFixedCharge.id })).not.toBeNull()
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/fixed-charges/${fixedCharge.id}`)

            expect(response.statusCode).toBe(401)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/fixed-charges/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const fixedCharge = await createFixedCharge(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/fixed-charges/${fixedCharge.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await fixedChargeRepository.findOneBy({ id: fixedCharge.id })).not.toBeNull()
        })
    })
})
