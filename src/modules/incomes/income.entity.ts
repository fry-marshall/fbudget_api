import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { User } from "../users/user.entity";
import { Account } from "../accounts/account.entity";

@Entity('incomes')
@Check('CHK_incomes_day_of_month', `"dayOfMonth" BETWEEN 1 AND 31`)
export class Income extends AbstractEntity {
    @Column()
    label?: string;

    @Column({ type: 'int' })
    amount?: number;

    @Column({ type: 'smallint', nullable: true })
    dayOfMonth?: number | null;

    @Column({ default: false })
    isVariable?: boolean;

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

    @ManyToOne(() => User, (user) => user.incomes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
