import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Category } from "../categories/category.entity";
import { FixedCharge } from "../fixed-charges/fixed-charge.entity";
import { Income } from "../incomes/income.entity";
import { InstallmentPlan } from "../installment-plans/installment-plan.entity";
import { Provision } from "../provisions/provision.entity";
import { SavingsGoal } from "../savings-goals/savings-goal.entity";
import { Transaction } from "../transactions/transaction.entity";
import { BudgetController } from "./budget.controller";
import { BudgetService } from "./budget.service";

@Module({
    controllers: [BudgetController],
    providers: [BudgetService],
    imports: [TypeOrmModule.forFeature([Income, FixedCharge, InstallmentPlan, Provision, SavingsGoal, Transaction, Category])]
})
export class BudgetModule {}
