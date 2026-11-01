import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { AccountType } from "./types";
import { User } from "../users/user.entity";

@Entity('accounts')
@Index('UQ_accounts_user_primary', ['userId'], { unique: true, where: '"isPrimary" = true' })
@Check('CHK_accounts_monthly_funding_day', `"monthlyFundingDay" BETWEEN 1 AND 31`)
export class Account extends AbstractEntity {
    @Column({ type: 'enum', enum: AccountType })
    type?: AccountType;

    @Column({ nullable: true })
    operator?: string;

    @Column()
    name?: string;

    @Column({ type: 'char', length: 4, nullable: true })
    last4?: string;

    @Column({ type: 'varchar', length: 2, nullable: true })
    country?: string;

    @Column({ type: 'int' })
    initialBalance?: number;

    @Column({ default: false })
    isPrimary?: boolean;

    // Fixed amount moved every month from the primary account to this one, never set on the primary account
    @Column({ type: 'int', nullable: true })
    monthlyFunding?: number | null;

    // Day of the monthly funding, null to follow the day of the reference income of the user
    @Column({ type: 'smallint', nullable: true })
    monthlyFundingDay?: number | null;

    // Last month (YYYY-MM) whose pending monthly funding was generated, so that a deleted one is never generated again
    @Column({ type: 'varchar', length: 7, nullable: true })
    lastGeneratedMonth?: string | null;

    @Column()
    userId?: string;

    @ManyToOne(() => User, (user) => user.accounts, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
