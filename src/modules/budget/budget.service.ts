import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { And, LessThan, MoreThanOrEqual, Repository } from "typeorm";
import { addMonthsToDate } from "src/common/helpers/helpers";
import { Category } from "../categories/category.entity";
import { FixedCharge } from "../fixed-charges/fixed-charge.entity";
import { Income } from "../incomes/income.entity";
import { InstallmentPlan } from "../installment-plans/installment-plan.entity";
import { Provision } from "../provisions/provision.entity";
import { SavingsGoal } from "../savings-goals/savings-goal.entity";
import { Transaction } from "../transactions/transaction.entity";
import { TransactionSourceType, TransactionStatus } from "../transactions/types";
import { computeBudgetDashboard, computeBudgetSummary } from "./budget.calculator";
import { BudgetDashboardResponseDto } from "./dto/budget-dashboard-response.dto";
import { BudgetSummaryResponseDto } from "./dto/budget-summary-response.dto";
import { BudgetRules } from "./types";

const getCurrentMonth = (): string => new Date().toISOString().slice(0, 7)

@Injectable()
export class BudgetService {

    constructor(
        @InjectRepository(Income)
        private incomeRepository: Repository<Income>,
        @InjectRepository(FixedCharge)
        private fixedChargeRepository: Repository<FixedCharge>,
        @InjectRepository(InstallmentPlan)
        private installmentPlanRepository: Repository<InstallmentPlan>,
        @InjectRepository(Provision)
        private provisionRepository: Repository<Provision>,
        @InjectRepository(SavingsGoal)
        private savingsGoalRepository: Repository<SavingsGoal>,
        @InjectRepository(Transaction)
        private transactionRepository: Repository<Transaction>,
        @InjectRepository(Category)
        private categoryRepository: Repository<Category>,
    ) { }

    /**
     * What is really free to live in a month, from the current rules of the user, the current month (UTC) by default
     */
    async getSummary(userId: string, month: string = getCurrentMonth()): Promise<BudgetSummaryResponseDto> {
        return computeBudgetSummary(month, await this.findRules(userId))
    }

    /**
     * Where the user stands in a month on the current day (UTC): the budget of the month from the current rules minus the confirmed manual expenses, the current month by default
     */
    async getDashboard(userId: string, month: string = getCurrentMonth()): Promise<BudgetDashboardResponseDto> {
        const monthStart = `${month}-01`
        const [rules, transactions, categories] = await Promise.all([
            this.findRules(userId),
            this.transactionRepository.find({
                where: {
                    userId,
                    sourceType: TransactionSourceType.MANUAL,
                    status: TransactionStatus.CONFIRMED,
                    occurredOn: And(MoreThanOrEqual(monthStart), LessThan(addMonthsToDate(monthStart, 1))),
                },
            }),
            this.categoryRepository.find({ where: { userId }, order: { createdAt: 'ASC' } }),
        ])

        return computeBudgetDashboard(computeBudgetSummary(month, rules), transactions, categories, new Date())
    }

    private async findRules(userId: string): Promise<BudgetRules> {
        const [incomes, fixedCharges, installmentPlans, provisions, savingsGoals] = await Promise.all([
            this.incomeRepository.find({ where: { userId } }),
            this.fixedChargeRepository.find({ where: { userId } }),
            this.installmentPlanRepository.find({ where: { userId }, relations: { installments: true } }),
            this.provisionRepository.find({ where: { userId } }),
            this.savingsGoalRepository.find({ where: { userId } }),
        ])

        return { incomes, fixedCharges, installmentPlans, provisions, savingsGoals }
    }
}
