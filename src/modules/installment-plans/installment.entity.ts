import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { InstallmentPlan } from "./installment-plan.entity";

// The paid status is not stored: an installment is paid when a transaction references it
@Entity('installments')
@Index('UQ_installments_plan_index', ['planId', 'index'], { unique: true })
export class Installment extends AbstractEntity {
    @Column({ type: 'smallint' })
    index?: number;

    @Column({ type: 'date' })
    dueDate?: string;

    @Column({ type: 'int' })
    amount?: number;

    @Column()
    planId?: string;

    @ManyToOne(() => InstallmentPlan, (plan) => plan.installments, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'planId' })
    plan?: InstallmentPlan;
}
