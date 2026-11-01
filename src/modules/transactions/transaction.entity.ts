import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { User } from "../users/user.entity";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { TransactionSourceType, TransactionStatus } from "./types";
import { Provision } from "../provisions/provision.entity";
import { Installment } from "../installment-plans/installment.entity";
import { SavingsGoal } from "../savings-goals/savings-goal.entity";
import { FixedCharge } from "../fixed-charges/fixed-charge.entity";
import { Income } from "../incomes/income.entity";

@Entity('transactions')
@Index('IDX_transactions_user_occurred_on', ['userId', 'occurredOn'])
@Index('IDX_transactions_account_occurred_on', ['accountId', 'occurredOn'])
@Index('IDX_transactions_category_occurred_on', ['categoryId', 'occurredOn'])
@Index('IDX_transactions_provision', ['provisionId'])
@Index('UQ_transactions_installment', ['installmentId'], { unique: true })
@Index('IDX_transactions_savings_goal', ['savingsGoalId'])
@Index('IDX_transactions_transfer', ['transferId'])
@Index('IDX_transactions_fixed_charge', ['fixedChargeId'])
@Index('IDX_transactions_income', ['incomeId'])
export class Transaction extends AbstractEntity {
    @Column({ type: 'int' })
    amount?: number;

    @Column({ type: 'varchar', nullable: true })
    merchant?: string | null;

    @Column({ type: 'text', nullable: true })
    note?: string | null;

    @Column({ type: 'varchar', array: true, default: [] })
    tags?: string[];

    @Column({ type: 'date' })
    occurredOn?: string;

    @Column({ type: 'enum', enum: TransactionSourceType, default: TransactionSourceType.MANUAL })
    sourceType?: TransactionSourceType;

    // Pending when generated for the month and not validated yet, only the confirmed ones change the balances
    @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.CONFIRMED })
    status?: TransactionStatus;

    // Required on creation, set to null when the account is deleted to keep the budget history
    @Column({ type: 'uuid', nullable: true })
    accountId?: string | null;

    @ManyToOne(() => Account, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'accountId' })
    account?: Account | null;

    @Column({ type: 'uuid', nullable: true })
    categoryId?: string | null;

    @ManyToOne(() => Category, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'categoryId' })
    category?: Category | null;

    // Set by the server when the transaction settles a provision, kept null when the provision is deleted
    @Column({ type: 'uuid', nullable: true })
    provisionId?: string | null;

    @ManyToOne(() => Provision, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'provisionId' })
    provision?: Provision | null;

    // Set by the server when the transaction pays an installment, unique so that an installment is paid once
    @Column({ type: 'uuid', nullable: true })
    installmentId?: string | null;

    @ManyToOne(() => Installment, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'installmentId' })
    installment?: Installment | null;

    // Set by the server when the transaction is a contribution to a savings goal, kept null when the goal is deleted
    @Column({ type: 'uuid', nullable: true })
    savingsGoalId?: string | null;

    @ManyToOne(() => SavingsGoal, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'savingsGoalId' })
    savingsGoal?: SavingsGoal | null;

    // Set by the server when the transaction is generated from a fixed charge, kept null when the fixed charge is deleted
    @Column({ type: 'uuid', nullable: true })
    fixedChargeId?: string | null;

    @ManyToOne(() => FixedCharge, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'fixedChargeId' })
    fixedCharge?: FixedCharge | null;

    // Set by the server when the transaction is generated from an income, kept null when the income is deleted
    @Column({ type: 'uuid', nullable: true })
    incomeId?: string | null;

    @ManyToOne(() => Income, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'incomeId' })
    income?: Income | null;

    // Shared by the two transactions of a transfer between two accounts of the user
    @Column({ type: 'uuid', nullable: true })
    transferId?: string | null;

    @Column()
    userId?: string;

    @ManyToOne(() => User, (user) => user.transactions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
