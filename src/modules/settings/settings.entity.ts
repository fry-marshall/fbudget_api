import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Currency } from "./types";
import { User } from "../users/user.entity";

@Entity('settings')
export class Settings {

    @PrimaryGeneratedColumn('uuid')
    id?: string;

    @Column({ type: 'enum', nullable: true, name: 'primary_currency', enum: Currency, default: Currency.EUR })
    primaryCurrency?: Currency;

    @Column({ type: 'int', nullable: true, name: 'monthly_budget' })
    monthlyBudget?: number;

    @OneToOne(() => User, (user) => user.settings, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user?: User;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt?: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt?: Date;
}