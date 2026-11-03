import { CategoryType } from "src/modules/categories/types";
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
    provisionSmoothing: number;
    spentThisMonth: number;
    // monthBudget minus the expenses recorded by the user
    freeAmount: number;
    // Share of monthBudget spent, null without positive budget
    pacingPct: number | null;
    // freeAmount at the end of the month if the user keeps spending at the same pace
    projectedBalance: number;
    daysElapsed: number;
    daysInMonth: number;
    categories: CategoryPacing[];
}

/**
 * Expenses of a category in a month against its envelope, the front picks the color from pct
 */
export type CategoryPacing = {
    categoryId: string;
    type: CategoryType;
    label: string | null;
    spent: number;
    envelopeBudget: number | null;
    // Share of envelopeBudget spent, null without positive envelope
    pct: number | null;
}
