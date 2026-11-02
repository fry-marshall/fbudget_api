import { Account } from "src/modules/accounts/account.entity";
import { FixedCharge } from "src/modules/fixed-charges/fixed-charge.entity";
import { Income } from "src/modules/incomes/income.entity";
import { InstallmentPlan } from "src/modules/installment-plans/installment-plan.entity";
import { Provision } from "src/modules/provisions/provision.entity";
import { SavingsGoal } from "src/modules/savings-goals/savings-goal.entity";
import { PlannedSource } from "./planned_source.enum";

/**
 * A transaction expected in the month, not stored
 */
export type PlannedTransaction = {
    source: PlannedSource;
    // Id of the rule it comes from: the installment for an installment, the funded account for an account funding
    sourceId: string;
    label: string;
    // Signed for a debit or a credit, positive for a transfer
    amount: number;
    occurredOn: string;
    // Account debited or credited, the source account of a transfer
    accountId: string;
    // Only set on a transfer
    toAccountId?: string;
    categoryId?: string | null;
}

/**
 * All the rules of a user the planned transactions of a month are computed from
 */
export type PlanningRules = {
    accounts: Account[];
    incomes: Income[];
    fixedCharges: FixedCharge[];
    installmentPlans: InstallmentPlan[];
    provisions: Provision[];
    savingsGoals: SavingsGoal[];
}

/**
 * A rule generating transactions every month, its cursor is the last month generated
 */
export type GeneratedRule = {
    id?: string;
    lastGeneratedMonth?: string | null;
}
