import { Check, Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { User } from "../users/user.entity";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";

@Entity('fixed_charges')
@Check('CHK_fixed_charges_day_of_month', `"dayOfMonth" BETWEEN 1 AND 31`)
export class FixedCharge extends AbstractEntity {
    @Column()
    label?: string;

    @Column({ type: 'int' })
    amount?: number;

    @Column({ type: 'smallint' })
    dayOfMonth?: number;

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

    @ManyToOne(() => User, (user) => user.fixedCharges, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
