import { FixedCharge } from "src/modules/fixed-charges/fixed-charge.entity";
import { Income } from "src/modules/incomes/income.entity";
import { InstallmentPlan } from "src/modules/installment-plans/installment-plan.entity";
import { Provision } from "src/modules/provisions/provision.entity";
import { SavingsGoal } from "src/modules/savings-goals/savings-goal.entity";

/**
 * Rules of a user the budget of a month is computed from
 */
export type BudgetRules = {
    incomes: Income[];
    fixedCharges: FixedCharge[];
    installmentPlans: InstallmentPlan[];
    provisions: Provision[];
    savingsGoals: SavingsGoal[];
}

/**
 * Budget of a month before any expense (CALCULATIONS §3), amounts in the smallest unit of the primary currency
 */
export type BudgetSummary = {
    month: string;
    daysInMonth: number;
    monthlyIncome: number;
    fixedCharges: number;
    provisionSmoothing: number;
    installmentsDueThisMonth: number;
    savingsContribution: number;
    // What is left to live once everything planned is put aside, negative when the commitments exceed the incomes
    freeAmount: number;
    perDay: number;
}

/**
 * State of the budget of a month on a given day (CALCULATIONS §4)
 */
export type BudgetDashboard = {
    month: string;
    monthBudget: number;
    spentThisMonth: number;
    // monthBudget minus the expenses recorded by the user
    freeAmount: number;
    // Share of monthBudget spent, null without positive budget
    pacingPct: number | null;
    // freeAmount at the end of the month if the user keeps spending at the same pace
    projectedBalance: number;
    daysElapsed: number;
    daysInMonth: number;
}
