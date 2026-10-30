import { Column, Entity, JoinColumn, OneToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { Currency } from "./types";
import { User } from "../users/user.entity";

@Entity('settings')
export class Settings extends AbstractEntity {
    @Column({ type: 'enum', nullable: true, enum: Currency })
    primaryCurrency?: Currency | null;

    @Column({ type: 'int', nullable: true })
    monthlyBudget?: number;

    @OneToOne(() => User, (user) => user.settings, { onDelete: 'CASCADE' })
    @JoinColumn()
    user?: User;
}