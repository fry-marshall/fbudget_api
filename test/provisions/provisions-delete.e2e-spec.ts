import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Provision } from "src/modules/provisions/provision.entity";
import { ProvisionStatus } from "src/modules/provisions/types";
import { Transaction } from "src/modules/transactions/transaction.entity";
import { TransactionSourceType } from "src/modules/transactions/types";
import request from 'supertest';
import { Repository } from "typeorm";
import { resetDatabase } from "../utils/database";
import { createAccount, createProvision, createTransaction, createUserAndLogin, signAccessToken } from "../utils/factories";
import { createTestApp, TestContext } from "../utils/test-app";

describe('DELETE provisions/:id', () => {
    let ctx: TestContext;
    let provisionRepository: Repository<Provision>;

    const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

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
        it('should delete the provision and keep the other ones', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)
            const otherProvision = await createProvision(ctx, user, { label: 'Coiffeur' })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(response.body.data.message).toBe(SUCCESS_MESSAGES.PROVISION.PROVISION_DELETED)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toBeNull()
            expect(await provisionRepository.findOneBy({ id: otherProvision.id })).not.toBeNull()
        })

        it('should keep the settlement transactions without provision', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const account = await createAccount(ctx, user)
            const provision = await createProvision(ctx, user)
            const settlement = await createTransaction(ctx, user, account, { amount: -70000, sourceType: TransactionSourceType.PROVISION, provisionId: provision.id })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await ctx.repo(Transaction).findOneBy({ id: settlement.id })).toMatchObject({ provisionId: null, amount: -70000, sourceType: TransactionSourceType.PROVISION })
        })

        it('should delete a cancelled provision', async () => {
            const { user, accessToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user, { status: ProvisionStatus.CANCELLED })

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(200)
            expect(await provisionRepository.findOneBy({ id: provision.id })).toBeNull()
        })
    })

    describe('Failure cases', () => {
        it('should throw bad request when id is not a uuid', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete('/api/v1/provisions/toto')
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(400)
            expect(response.body.message).toBe(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST)
        })

        it('should throw not found when provision does not exist', async () => {
            const { accessToken } = await createUserAndLogin(ctx)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/provisions/${UNKNOWN_ID}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND)
        })

        it('should throw not found and keep the provision when it belongs to another user', async () => {
            const { accessToken } = await createUserAndLogin(ctx)
            const { user: otherUser } = await createUserAndLogin(ctx, { email: 'other@gmail.com' })
            const otherProvision = await createProvision(ctx, otherUser)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/provisions/${otherProvision.id}`)
                .set('Authorization', `Bearer ${accessToken}`)

            expect(response.statusCode).toBe(404)
            expect(response.body.message).toBe(ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND)
            expect(await provisionRepository.findOneBy({ id: otherProvision.id })).not.toBeNull()
        })

        it('should throw unauthorized when no token is provided', async () => {
            const { user } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/provisions/${provision.id}`)

            expect(response.statusCode).toBe(401)
            expect(await provisionRepository.findOneBy({ id: provision.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is malformed', async () => {
            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/provisions/${UNKNOWN_ID}`)
                .set('Authorization', 'Bearer toto')

            expect(response.statusCode).toBe(401)
        })

        it('should throw unauthorized when token is expired', async () => {
            const { user } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)
            const expiredAccessToken = signAccessToken(ctx, user, -10)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${expiredAccessToken}`)

            expect(response.statusCode).toBe(401)
            expect(await provisionRepository.findOneBy({ id: provision.id })).not.toBeNull()
        })

        it('should throw unauthorized when token is a refresh token', async () => {
            const { user, refreshToken } = await createUserAndLogin(ctx)
            const provision = await createProvision(ctx, user)

            const response = await request(ctx.app.getHttpServer())
                .delete(`/api/v1/provisions/${provision.id}`)
                .set('Authorization', `Bearer ${refreshToken}`)

            expect(response.statusCode).toBe(401)
            expect(await provisionRepository.findOneBy({ id: provision.id })).not.toBeNull()
        })
    })
})
