import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { User } from "../users/user.entity";
import { Account } from "../accounts/account.entity";

@Entity('savings_goals')
@Check('CHK_savings_goals_target_date', `"targetDate" IS NULL OR "targetAmount" IS NOT NULL`)
@Check('CHK_savings_goals_day_of_month', `"dayOfMonth" BETWEEN 1 AND 31`)
export class SavingsGoal extends AbstractEntity {
    @Column()
    label?: string;

    // Null for a plain recurring transfer without a target, hasGoal is derived from it
    @Column({ type: 'int', nullable: true })
    targetAmount?: number | null;

    @Column({ type: 'int' })
    monthlyContribution?: number;

    @Column({ type: 'date', nullable: true })
    targetDate?: string | null;

    // Day of the monthly contribution, null to follow the day of the reference income of the user
    @Column({ type: 'smallint', nullable: true })
    dayOfMonth?: number | null;

    // Default account of the contributions
    @Column({ type: 'uuid', nullable: true })
    accountId?: string | null;

    @ManyToOne(() => Account, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'accountId' })
    account?: Account | null;

    // Last month (YYYY-MM) whose pending transactions were generated, so that a deleted one is never generated again
    @Column({ type: 'varchar', length: 7, nullable: true })
    lastGeneratedMonth?: string | null;

    @Column()
    userId?: string;

    @ManyToOne(() => User, (user) => user.savingsGoals, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
