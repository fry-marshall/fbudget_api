import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { FixedCharge } from "./fixed-charge.entity";
import { FixedChargeResponseDto } from "./dto/fixed-charge-response.dto";
import { CreateFixedChargeDto } from "./dto/create-fixed-charge.dto";
import { UpdateFixedChargeDto } from "./dto/update-fixed-charge.dto";

const FOREIGN_KEY_VIOLATION = '23503'

@Injectable()
export class FixedChargeService {

    constructor(
        @InjectRepository(FixedCharge)
        private fixedChargeRepository: Repository<FixedCharge>
    ) { }

    async findAll(userId: string): Promise<FixedChargeResponseDto[]> {
        const fixedCharges = await this.fixedChargeRepository.find({
            where: { userId },
            order: { createdAt: 'ASC' }
        })

        return fixedCharges.map((fixedCharge) => this.toDto(fixedCharge))
    }

    async create(userId: string, createFixedChargeDto: CreateFixedChargeDto): Promise<FixedChargeResponseDto> {
        await this.checkUserRelations(userId, createFixedChargeDto)

        try {
            const fixedCharge = await this.fixedChargeRepository.save({ ...createFixedChargeDto, userId })

            return this.toDto(fixedCharge)
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    async update(userId: string, fixedChargeId: string, updateFixedChargeDto: UpdateFixedChargeDto): Promise<FixedChargeResponseDto> {
        const fixedCharge = await this.findUserFixedCharge(userId, fixedChargeId)
        await this.checkUserRelations(userId, updateFixedChargeDto)

        try {
            await this.fixedChargeRepository.update(fixedCharge.id!, { ...updateFixedChargeDto })
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }

        return this.toDto((await this.fixedChargeRepository.findOneBy({ id: fixedCharge.id }))!)
    }

    async remove(userId: string, fixedChargeId: string): Promise<{ message: string }> {
        const fixedCharge = await this.findUserFixedCharge(userId, fixedChargeId)

        await this.fixedChargeRepository.delete(fixedCharge.id!)

        return { message: SUCCESS_MESSAGES.FIXED_CHARGE.FIXED_CHARGE_DELETED }
    }

    private async findUserFixedCharge(userId: string, fixedChargeId: string): Promise<FixedCharge> {
        const fixedCharge = await this.fixedChargeRepository.findOne({ where: { id: fixedChargeId, userId } })

        if (!fixedCharge) {
            throw new NotFoundException(ERRORS_MESSAGES.FIXED_CHARGES.FIXED_CHARGE_NOT_FOUND)
        }

        return fixedCharge
    }

    private async checkUserRelations(userId: string, { accountId, categoryId }: { accountId?: string | null, categoryId?: string | null }): Promise<void> {
        const { manager } = this.fixedChargeRepository

        if (accountId && !(await manager.exists(Account, { where: { id: accountId, userId } }))) {
            throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        }

        if (categoryId && !(await manager.exists(Category, { where: { id: categoryId, userId } }))) {
            throw new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
        }
    }

    /**
     * The user, the account or the category may be deleted between the checks and the write
     */
    private handleForeignKeyViolation(err: unknown): void {
        if (err instanceof QueryFailedError && err.driverError.code === FOREIGN_KEY_VIOLATION) {
            const detail = String(err.driverError.detail)

            if (detail.includes('accountId')) {
                throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            }
            if (detail.includes('categoryId')) {
                throw new NotFoundException(ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND)
            }
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        }
    }

    private toDto(fixedCharge: FixedCharge): FixedChargeResponseDto {
        return {
            id: fixedCharge.id,
            label: fixedCharge.label,
            amount: fixedCharge.amount,
            dayOfMonth: fixedCharge.dayOfMonth,
            accountId: fixedCharge.accountId ?? null,
            categoryId: fixedCharge.categoryId ?? null,
            createdAt: fixedCharge.createdAt,
        }
    }
}
