import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Category } from "./category.entity";
import { CategoryResponseDto } from "./dto/category-response.dto";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'

@Injectable()
export class CategoryService {

    constructor(
        @InjectRepository(Category)
        private categoryRepository: Repository<Category>
    ) { }

    async findAll(userId: string): Promise<CategoryResponseDto[]> {
        const categories = await this.categoryRepository.find({
            where: { userId },
            order: { createdAt: 'ASC' }
        })

        return categories.map((category) => this.toDto(category))
    }

    async create(userId: string, createCategoryDto: CreateCategoryDto): Promise<CategoryResponseDto> {
        try {
            const category = await this.categoryRepository.save({ ...createCategoryDto, userId })

            return this.toDto(category)
        } catch (err) {
            if (err instanceof QueryFailedError && err.driverError.code === UNIQUE_VIOLATION) {
                throw new ConflictException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_ALREADY_EXISTS)
            }
            if (err instanceof QueryFailedError && err.driverError.code === FOREIGN_KEY_VIOLATION) {
                throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            }
            throw err
        }
    }

    async update(userId: string, categoryId: string, updateCategoryDto: UpdateCategoryDto): Promise<CategoryResponseDto> {
        const category = await this.findUserCategory(userId, categoryId)

        await this.categoryRepository.update(category.id!, { ...updateCategoryDto })

        return this.toDto((await this.categoryRepository.findOneBy({ id: category.id }))!)
    }

    async remove(userId: string, categoryId: string): Promise<{ message: string }> {
        const category = await this.findUserCategory(userId, categoryId)

        await this.categoryRepository.delete(category.id!)

        return { message: SUCCESS_MESSAGES.CATEGORY.CATEGORY_DELETED }
    }

    private async findUserCategory(userId: string, categoryId: string): Promise<Category> {
        const category = await this.categoryRepository.findOne({ where: { id: categoryId, userId } })

        if (!category) {
            throw new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
        }

        return category
    }

    private toDto(category: Category): CategoryResponseDto {
        return {
            id: category.id,
            type: category.type,
            label: category.label ?? null,
            envelopeBudget: category.envelopeBudget ?? null,
            createdAt: category.createdAt,
        }
    }
}
