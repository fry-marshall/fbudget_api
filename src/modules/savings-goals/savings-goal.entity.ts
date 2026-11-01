import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { User } from "../users/user.entity";
import { Account } from "../accounts/account.entity";

@Entity('savings_goals')
@Check('CHK_savings_goals_target_date', `"targetDate" IS NULL OR "targetAmount" IS NOT NULL`)
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

    // Default account of the contributions
    @Column({ type: 'uuid', nullable: true })
    accountId?: string | null;

    @ManyToOne(() => Account, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'accountId' })
    account?: Account | null;

    @Column()
    userId?: string;

    @ManyToOne(() => User, (user) => user.savingsGoals, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
