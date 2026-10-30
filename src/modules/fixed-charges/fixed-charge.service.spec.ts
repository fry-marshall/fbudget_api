import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { FixedCharge } from "./fixed-charge.entity";
import { FixedChargeService } from "./fixed-charge.service";

describe('FixedChargeService', () => {

    let managerMocked = {
        exists: jest.fn(),
    };
    let fixedChargeRepositoryMocked = {
        find: jest.fn(),
        findOne: jest.fn(),
        findOneBy: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        manager: managerMocked,
    };
    let fixedChargeService: FixedChargeService;

    const createdAt = new Date()
    const fixedChargeMocked: FixedCharge = {
        id: 'fixed-charge-id',
        label: 'Loyer',
        amount: 85000,
        dayOfMonth: 5,
        accountId: null,
        categoryId: null,
        userId: 'user-id',
        createdAt,
        updatedAt: createdAt,
    }
    const fixedChargeDto = {
        id: 'fixed-charge-id',
        label: 'Loyer',
        amount: 85000,
        dayOfMonth: 5,
        accountId: null,
        categoryId: null,
        createdAt,
    }
    const createBody = { label: 'Loyer', amount: 85000, dayOfMonth: 5 }

    const foreignKeyError = (detail: string) => new QueryFailedError('INSERT', [], Object.assign(new Error('query failed'), { code: '23503', detail }))

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                FixedChargeService,
                { provide: getRepositoryToken(FixedCharge), useValue: fixedChargeRepositoryMocked },
            ]
        }).compile()

        fixedChargeService = moduleRef.get(FixedChargeService)
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('findAll', () => {
        describe('Success cases', () => {
            it('should return the user fixed charges oldest first without the user fields', async () => {
                fixedChargeRepositoryMocked.find.mockResolvedValueOnce([fixedChargeMocked])

                const response = await fixedChargeService.findAll('user-id')

                expect(response).toStrictEqual([fixedChargeDto])
                expect(fixedChargeRepositoryMocked.find).toHaveBeenCalledWith({ where: { userId: 'user-id' }, order: { createdAt: 'ASC' } })
            })
        })

        describe('Failure cases', () => {
            it('should throw Error when find fails', async () => {
                fixedChargeRepositoryMocked.find.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(fixedChargeService.findAll('user-id')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('create', () => {
        describe('Success cases', () => {
            it('should save the fixed charge for the user without checking an account or a category', async () => {
                fixedChargeRepositoryMocked.save.mockResolvedValueOnce(fixedChargeMocked)

                const response = await fixedChargeService.create('user-id', createBody)

                expect(response).toStrictEqual(fixedChargeDto)
                expect(managerMocked.exists).not.toHaveBeenCalled()
                expect(fixedChargeRepositoryMocked.save).toHaveBeenCalledWith({ ...createBody, userId: 'user-id' })
            })

            it('should check the account and the category belong to the user before saving', async () => {
                managerMocked.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(true)
                fixedChargeRepositoryMocked.save.mockResolvedValueOnce({ ...fixedChargeMocked, accountId: 'account-id', categoryId: 'category-id' })

                const response = await fixedChargeService.create('user-id', { ...createBody, accountId: 'account-id', categoryId: 'category-id' })

                expect(response).toStrictEqual({ ...fixedChargeDto, accountId: 'account-id', categoryId: 'category-id' })
                expect(managerMocked.exists).toHaveBeenCalledWith(Account, { where: { id: 'account-id', userId: 'user-id' } })
                expect(managerMocked.exists).toHaveBeenCalledWith(Category, { where: { id: 'category-id', userId: 'user-id' } })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when account doesn\'t belong to the user', async () => {
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(fixedChargeService.create('user-id', { ...createBody, accountId: 'account-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND))
                expect(fixedChargeRepositoryMocked.save).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when category doesn\'t belong to the user', async () => {
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(fixedChargeService.create('user-id', { ...createBody, categoryId: 'category-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND))
                expect(fixedChargeRepositoryMocked.save).not.toHaveBeenCalled()
            })

            it.each([
                ['user', 'Key (userId)=(user-id) is not present in table "users".', ERRORS_MESSAGES.AUTH.USER_NOT_FOUND],
                ['account', 'Key (accountId)=(account-id) is not present in table "accounts".', ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND],
                ['category', 'Key (categoryId)=(category-id) is not present in table "categories".', ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND],
            ])('should throw NotFoundException when the %s is deleted before saving', async (_, detail, message) => {
                managerMocked.exists.mockResolvedValue(true)
                fixedChargeRepositoryMocked.save.mockRejectedValueOnce(foreignKeyError(detail))

                await expect(fixedChargeService.create('user-id', { ...createBody, accountId: 'account-id', categoryId: 'category-id' })).rejects.toThrow(new NotFoundException(message))
                managerMocked.exists.mockReset()
            })

            it('should throw Error when save fails', async () => {
                fixedChargeRepositoryMocked.save.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(fixedChargeService.create('user-id', createBody)).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('update', () => {
        describe('Success cases', () => {
            it('should update the fixed charge and return it', async () => {
                fixedChargeRepositoryMocked.findOne.mockResolvedValueOnce(fixedChargeMocked)
                fixedChargeRepositoryMocked.findOneBy.mockResolvedValueOnce({ ...fixedChargeMocked, amount: 90000 })

                const response = await fixedChargeService.update('user-id', 'fixed-charge-id', { amount: 90000 })

                expect(response).toStrictEqual({ ...fixedChargeDto, amount: 90000 })
                expect(fixedChargeRepositoryMocked.findOne).toHaveBeenCalledWith({ where: { id: 'fixed-charge-id', userId: 'user-id' } })
                expect(fixedChargeRepositoryMocked.update).toHaveBeenCalledWith('fixed-charge-id', { amount: 90000 })
                expect(managerMocked.exists).not.toHaveBeenCalled()
            })

            it('should unlink the account and the category without checking them', async () => {
                fixedChargeRepositoryMocked.findOne.mockResolvedValueOnce({ ...fixedChargeMocked, accountId: 'account-id', categoryId: 'category-id' })
                fixedChargeRepositoryMocked.findOneBy.mockResolvedValueOnce(fixedChargeMocked)

                const response = await fixedChargeService.update('user-id', 'fixed-charge-id', { accountId: null, categoryId: null })

                expect(response).toStrictEqual(fixedChargeDto)
                expect(managerMocked.exists).not.toHaveBeenCalled()
                expect(fixedChargeRepositoryMocked.update).toHaveBeenCalledWith('fixed-charge-id', { accountId: null, categoryId: null })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when fixed charge doesn\'t belong to the user', async () => {
                fixedChargeRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(fixedChargeService.update('user-id', 'fixed-charge-id', { amount: 90000 })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.FIXED_CHARGES.FIXED_CHARGE_NOT_FOUND))
                expect(fixedChargeRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when category doesn\'t belong to the user', async () => {
                fixedChargeRepositoryMocked.findOne.mockResolvedValueOnce(fixedChargeMocked)
                managerMocked.exists.mockResolvedValueOnce(false)

                await expect(fixedChargeService.update('user-id', 'fixed-charge-id', { categoryId: 'category-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND))
                expect(fixedChargeRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it('should throw NotFoundException when category is deleted before updating', async () => {
                fixedChargeRepositoryMocked.findOne.mockResolvedValueOnce(fixedChargeMocked)
                managerMocked.exists.mockResolvedValueOnce(true)
                fixedChargeRepositoryMocked.update.mockRejectedValueOnce(foreignKeyError('Key (categoryId)=(category-id) is not present in table "categories".'))

                await expect(fixedChargeService.update('user-id', 'fixed-charge-id', { categoryId: 'category-id' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND))
            })

            it('should throw Error when update fails', async () => {
                fixedChargeRepositoryMocked.findOne.mockResolvedValueOnce(fixedChargeMocked)
                fixedChargeRepositoryMocked.update.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(fixedChargeService.update('user-id', 'fixed-charge-id', { amount: 90000 })).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('remove', () => {
        describe('Success cases', () => {
            it('should delete the fixed charge', async () => {
                fixedChargeRepositoryMocked.findOne.mockResolvedValueOnce(fixedChargeMocked)

                const response = await fixedChargeService.remove('user-id', 'fixed-charge-id')

                expect(response.message).toBe(SUCCESS_MESSAGES.FIXED_CHARGE.FIXED_CHARGE_DELETED)
                expect(fixedChargeRepositoryMocked.delete).toHaveBeenCalledWith('fixed-charge-id')
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when fixed charge doesn\'t belong to the user', async () => {
                fixedChargeRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(fixedChargeService.remove('user-id', 'fixed-charge-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.FIXED_CHARGES.FIXED_CHARGE_NOT_FOUND))
                expect(fixedChargeRepositoryMocked.delete).not.toHaveBeenCalled()
            })

            it('should throw Error when delete fails', async () => {
                fixedChargeRepositoryMocked.findOne.mockResolvedValueOnce(fixedChargeMocked)
                fixedChargeRepositoryMocked.delete.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(fixedChargeService.remove('user-id', 'fixed-charge-id')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })
})
