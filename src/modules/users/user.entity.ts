import { Column, Entity, Index, JoinColumn, OneToMany, OneToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { AuthProvider, SubscriptionPlan, UserRole } from "./types";
import { Settings } from "../settings/settings.entity";
import { RefreshToken } from "../refresh-tokens/refresh-token.entity";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { Income } from "../incomes/income.entity";
import { FixedCharge } from "../fixed-charges/fixed-charge.entity";
import { Transaction } from "../transactions/transaction.entity";
import { Provision } from "../provisions/provision.entity";

@Entity('users')
@Index('UQ_users_email', ['email'], { unique: true })
export class User extends AbstractEntity {
    @Column()
    email?: string;

    @Column({ type: 'enum', enum: AuthProvider, array: true, default: [] })
    authProviders?: AuthProvider[];

    @Column({ nullable: true })
    displayName?: string

    @Column({ nullable: true })
    city?: string;

    @Column({ nullable: true })
    country?: string;

    @Column({ type: 'enum', enum: SubscriptionPlan, default: SubscriptionPlan.FREE })
    plan?: SubscriptionPlan;

    @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
    role?: UserRole;

    @Column({ nullable: true, select: false })
    otpCode?: string;

    @Column({ nullable: true, type: 'timestamptz' })
    otpExpiresAt?: Date;

    @Column({ type: 'int', default: 0 })
    otpAttempts?: number;

    @OneToOne(() => Settings, (settings) => settings.user, { cascade: ['insert'] })
    settings?: Settings;

    @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
    refreshTokens?: RefreshToken[]

    @OneToMany(() => Account, (account) => account.user)
    accounts?: Account[]

    @OneToMany(() => Category, (category) => category.user)
    categories?: Category[]

    @OneToMany(() => Income, (income) => income.user)
    incomes?: Income[]

    @OneToMany(() => FixedCharge, (fixedCharge) => fixedCharge.user)
    fixedCharges?: FixedCharge[]

    @OneToMany(() => Transaction, (transaction) => transaction.user)
    transactions?: Transaction[]

    @OneToMany(() => Provision, (provision) => provision.user)
    provisions?: Provision[]
}