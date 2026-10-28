import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Category } from "./category.entity";
import { CategoryService } from "./category.service";
import { CategoryType } from "./types";

describe('CategoryService', () => {

    let categoryRepositoryMocked = {
        find: jest.fn(),
        findOne: jest.fn(),
        findOneBy: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    };
    let categoryService: CategoryService;

    const createdAt = new Date()
    const categoryMocked: Category = {
        id: 'category-id',
        type: CategoryType.GROCERIES,
        label: null,
        envelopeBudget: 14000,
        userId: 'user-id',
        createdAt,
        updatedAt: createdAt,
    }
    const categoryDto = {
        id: 'category-id',
        type: CategoryType.GROCERIES,
        label: null,
        envelopeBudget: 14000,
        createdAt,
    }

    const queryFailedError = (code: string) => new QueryFailedError('INSERT', [], Object.assign(new Error('query failed'), { code }))

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                CategoryService,
                { provide: getRepositoryToken(Category), useValue: categoryRepositoryMocked },
            ]
        }).compile()

        categoryService = moduleRef.get(CategoryService)
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('findAll', () => {
        describe('Success cases', () => {
            it('should return the user categories oldest first without the user fields', async () => {
                categoryRepositoryMocked.find.mockResolvedValueOnce([categoryMocked])

                const response = await categoryService.findAll('user-id')

                expect(response).toStrictEqual([categoryDto])
                expect(categoryRepositoryMocked.find).toHaveBeenCalledWith({ where: { userId: 'user-id' }, order: { createdAt: 'ASC' } })
            })
        })

        describe('Failure cases', () => {
            it('should throw Error when find fails', async () => {
                categoryRepositoryMocked.find.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(categoryService.findAll('user-id')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('create', () => {
        describe('Success cases', () => {
            it('should save the category for the user and return it', async () => {
                categoryRepositoryMocked.save.mockResolvedValueOnce(categoryMocked)

                const response = await categoryService.create('user-id', { type: CategoryType.GROCERIES, envelopeBudget: 14000 })

                expect(response).toStrictEqual(categoryDto)
                expect(categoryRepositoryMocked.save).toHaveBeenCalledWith({ type: CategoryType.GROCERIES, envelopeBudget: 14000, userId: 'user-id' })
            })
        })

        describe('Failure cases', () => {
            it('should throw ConflictException when the user already has a category of this type', async () => {
                categoryRepositoryMocked.save.mockRejectedValueOnce(queryFailedError('23505'))

                await expect(categoryService.create('user-id', { type: CategoryType.GROCERIES })).rejects.toThrow(new ConflictException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_ALREADY_EXISTS))
            })

            it('should throw NotFoundException when user doesn\'t exist', async () => {
                categoryRepositoryMocked.save.mockRejectedValueOnce(queryFailedError('23503'))

                await expect(categoryService.create('user-id', { type: CategoryType.GROCERIES })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND))
            })

            it('should rethrow other database errors', async () => {
                const error = queryFailedError('23514')
                categoryRepositoryMocked.save.mockRejectedValueOnce(error)

                await expect(categoryService.create('user-id', { type: CategoryType.OTHER })).rejects.toBe(error)
            })

            it('should throw Error when save fails', async () => {
                categoryRepositoryMocked.save.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(categoryService.create('user-id', { type: CategoryType.GROCERIES })).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('update', () => {
        describe('Success cases', () => {
            it('should update the category and return it', async () => {
                categoryRepositoryMocked.findOne.mockResolvedValueOnce(categoryMocked)
                categoryRepositoryMocked.findOneBy.mockResolvedValueOnce({ ...categoryMocked, label: 'Supermarché' })

                const response = await categoryService.update('user-id', 'category-id', { label: 'Supermarché' })

                expect(response).toStrictEqual({ ...categoryDto, label: 'Supermarché' })
                expect(categoryRepositoryMocked.findOne).toHaveBeenCalledWith({ where: { id: 'category-id', userId: 'user-id' } })
                expect(categoryRepositoryMocked.update).toHaveBeenCalledWith('category-id', { label: 'Supermarché' })
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when category doesn\'t belong to the user', async () => {
                categoryRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(categoryService.update('user-id', 'category-id', { label: 'Supermarché' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND))
                expect(categoryRepositoryMocked.update).not.toHaveBeenCalled()
            })

            it('should throw Error when update fails', async () => {
                categoryRepositoryMocked.findOne.mockResolvedValueOnce(categoryMocked)
                categoryRepositoryMocked.update.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(categoryService.update('user-id', 'category-id', { label: 'Supermarché' })).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })

    describe('remove', () => {
        describe('Success cases', () => {
            it('should delete the category', async () => {
                categoryRepositoryMocked.findOne.mockResolvedValueOnce(categoryMocked)

                const response = await categoryService.remove('user-id', 'category-id')

                expect(response.message).toBe(SUCCESS_MESSAGES.CATEGORY.CATEGORY_DELETED)
                expect(categoryRepositoryMocked.delete).toHaveBeenCalledWith('category-id')
            })
        })

        describe('Failure cases', () => {
            it('should throw NotFoundException when category doesn\'t belong to the user', async () => {
                categoryRepositoryMocked.findOne.mockResolvedValueOnce(null)

                await expect(categoryService.remove('user-id', 'category-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND))
                expect(categoryRepositoryMocked.delete).not.toHaveBeenCalled()
            })

            it('should throw Error when delete fails', async () => {
                categoryRepositoryMocked.findOne.mockResolvedValueOnce(categoryMocked)
                categoryRepositoryMocked.delete.mockRejectedValueOnce(new Error('An error has occured'))

                await expect(categoryService.remove('user-id', 'category-id')).rejects.toThrow(new Error('An error has occured'))
            })
        })
    })
})
