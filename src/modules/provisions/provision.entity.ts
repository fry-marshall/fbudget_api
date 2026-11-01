import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { User } from "../users/user.entity";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { MAX_FREQUENCY_MONTHS, MIN_FREQUENCY_MONTHS, ProvisionStatus } from "./types";

@Entity('provisions')
@Check('CHK_provisions_frequency_months', `"frequencyMonths" BETWEEN ${MIN_FREQUENCY_MONTHS} AND ${MAX_FREQUENCY_MONTHS}`)
export class Provision extends AbstractEntity {
    @Column()
    label?: string;

    @Column({ type: 'int' })
    totalAmount?: number;

    @Column({ type: 'smallint' })
    frequencyMonths?: number;

    @Column({ type: 'date' })
    nextDueDate?: string;

    @Column({ type: 'date' })
    startedAt?: string;

    @Column({ type: 'enum', enum: ProvisionStatus, default: ProvisionStatus.ACTIVE })
    status?: ProvisionStatus;

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

    @Column()
    userId?: string;

    @ManyToOne(() => User, (user) => user.provisions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
