import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { Currency } from "./types";

@Entity('settings')
export class Settings {

    @PrimaryGeneratedColumn('uuid')
    id?: string;

    @Column({ type: 'enum', nullable: true, name: 'primary_currency', enum: Currency, default: Currency.EUR })
    primaryCurrency?: Currency;

    @Column({ type: 'int', nullable: true, name: 'monthly_budget' })
    monthlyBudget?: number;
}