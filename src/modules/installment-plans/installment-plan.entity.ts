import { Check, Column, Entity, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { User } from "../users/user.entity";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { Installment } from "./installment.entity";
import { InstallmentPlanStatus, MAX_INSTALLMENT_COUNT, MIN_INSTALLMENT_COUNT } from "./types";

@Entity('installment_plans')
@Check('CHK_installment_plans_installment_count', `"installmentCount" BETWEEN ${MIN_INSTALLMENT_COUNT} AND ${MAX_INSTALLMENT_COUNT}`)
export class InstallmentPlan extends AbstractEntity {
    @Column()
    label?: string;

    @Column({ type: 'varchar', nullable: true })
    provider?: string | null;

    @Column({ type: 'int' })
    totalAmount?: number;

    @Column({ type: 'smallint' })
    installmentCount?: number;

    @Column({ type: 'date' })
    firstDueDate?: string;

    // Only active or cancelled is stored, completed is derived from the paid installments
    @Column({ type: 'enum', enum: [InstallmentPlanStatus.ACTIVE, InstallmentPlanStatus.CANCELLED], enumName: 'installment_plans_status_enum', default: InstallmentPlanStatus.ACTIVE })
    status?: InstallmentPlanStatus;

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

    @OneToMany(() => Installment, (installment) => installment.plan)
    installments?: Installment[];

    @Column()
    userId?: string;

    @ManyToOne(() => User, (user) => user.installmentPlans, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
