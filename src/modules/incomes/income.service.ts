import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { ERRORS_MESSAGES, SUCCESS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Income } from "./income.entity";
import { IncomeResponseDto } from "./dto/income-response.dto";
import { CreateIncomeDto } from "./dto/create-income.dto";
import { UpdateIncomeDto } from "./dto/update-income.dto";

const FOREIGN_KEY_VIOLATION = '23503'

@Injectable()
export class IncomeService {

    constructor(
        @InjectRepository(Income)
        private incomeRepository: Repository<Income>
    ) { }

    async findAll(userId: string): Promise<IncomeResponseDto[]> {
        const incomes = await this.incomeRepository.find({
            where: { userId },
            order: { createdAt: 'ASC' }
        })

        return incomes.map((income) => this.toDto(income))
    }

    async create(userId: string, createIncomeDto: CreateIncomeDto): Promise<IncomeResponseDto> {
        await this.checkUserAccount(userId, createIncomeDto.accountId)

        try {
            const income = await this.incomeRepository.save({ ...createIncomeDto, userId })

            return this.toDto(income)
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    async update(userId: string, incomeId: string, updateIncomeDto: UpdateIncomeDto): Promise<IncomeResponseDto> {
        const income = await this.findUserIncome(userId, incomeId)
        await this.checkUserAccount(userId, updateIncomeDto.accountId)

        try {
            await this.incomeRepository.update(income.id!, { ...updateIncomeDto })
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }

        return this.toDto((await this.incomeRepository.findOneBy({ id: income.id }))!)
    }

    async remove(userId: string, incomeId: string): Promise<{ message: string }> {
        const income = await this.findUserIncome(userId, incomeId)

        await this.incomeRepository.delete(income.id!)

        return { message: SUCCESS_MESSAGES.INCOME.INCOME_DELETED }
    }

    private async findUserIncome(userId: string, incomeId: string): Promise<Income> {
        const income = await this.incomeRepository.findOne({ where: { id: incomeId, userId } })

        if (!income) {
            throw new NotFoundException(ERRORS_MESSAGES.INCOMES.INCOME_NOT_FOUND)
        }

        return income
    }

    private async checkUserAccount(userId: string, accountId?: string | null): Promise<void> {
        if (!accountId) return

        const accountExists = await this.incomeRepository.manager.exists(Account, { where: { id: accountId, userId } })

        if (!accountExists) {
            throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
        }
    }

    /**
     * The user or the account may be deleted between the checks and the write
     */
    private handleForeignKeyViolation(err: unknown): void {
        if (err instanceof QueryFailedError && err.driverError.code === FOREIGN_KEY_VIOLATION) {
            const isAccount = String(err.driverError.detail).includes('accountId')
            throw new NotFoundException(isAccount ? ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND : ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        }
    }

    private toDto(income: Income): IncomeResponseDto {
        return {
            id: income.id,
            label: income.label,
            amount: income.amount,
            dayOfMonth: income.dayOfMonth ?? null,
            isVariable: income.isVariable,
            accountId: income.accountId ?? null,
            createdAt: income.createdAt,
        }
    }
}
