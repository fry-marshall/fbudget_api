import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { User } from "../users/user.entity";
import { CategoryType } from "./types";

@Entity('categories')
@Index('UQ_categories_user_type', ['userId', 'type'], { unique: true, where: `"type" <> 'other'` })
@Check('CHK_categories_other_label', `"type" <> 'other' OR "label" IS NOT NULL`)
export class Category extends AbstractEntity {
    @Column({ type: 'enum', enum: CategoryType })
    type?: CategoryType;

    @Column({ type: 'varchar', nullable: true })
    label?: string | null;

    @Column({ type: 'int', nullable: true })
    envelopeBudget?: number | null;

    @Column()
    userId?: string;

    @ManyToOne(() => User, (user) => user.categories, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
