import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FixedCharge } from "../fixed-charges/fixed-charge.entity";
import { Income } from "../incomes/income.entity";
import { InstallmentPlan } from "../installment-plans/installment-plan.entity";
import { Provision } from "../provisions/provision.entity";
import { SavingsGoal } from "../savings-goals/savings-goal.entity";
import { computeBudgetSummary } from "./budget.calculator";
import { BudgetSummaryResponseDto } from "./dto/budget-summary-response.dto";
import { BudgetRules } from "./types";

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
    ) { }

    /**
     * What is really free to live in a month, from the current rules of the user, the current month (UTC) by default
     */
    async getSummary(userId: string, month: string = new Date().toISOString().slice(0, 7)): Promise<BudgetSummaryResponseDto> {
        return computeBudgetSummary(month, await this.findRules(userId))
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
