import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { AuthProvider, SubscriptionPlan, UserRole } from "./types";
import { Settings } from "../settings/settings.entity";

@Entity('users')
@Index('UQ_users_email_active', ['email'], {unique: true, where: '"deleted_at" IS NULL'})
export class User {
    @PrimaryGeneratedColumn('uuid')
    id?: string;

    @Column()
    email?: string

    @Column({ type: 'enum', name: 'auth_provider', enum: AuthProvider })
    authProvider?: AuthProvider

    @Column({ nullable: true, name: 'display_name' })
    displayName?: string

    @Column({ nullable: true })
    city?: string;

    @Column({ nullable: true })
    country?: string;

    @Column({ type: 'enum', enum: SubscriptionPlan, default: SubscriptionPlan.FREE })
    plan?: SubscriptionPlan;

    @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
    role?: UserRole;

    @Column({ name: 'otp_code', nullable: true })
    otpCode?: string

    @Column({ name: 'otp_expires_at', nullable: true, type: 'timestamptz' })
    otpExpiresAt?: Date;

    @OneToOne(() => Settings)
    @JoinColumn()
    settings?: Settings

    @CreateDateColumn({type: 'timestamptz', name: 'created_at'})
    createdAt?: Date;

    @UpdateDateColumn({type: 'timestamptz', name: 'updated_at'})
    updatedAt?: Date;

    @DeleteDateColumn({type: 'timestamptz', name: 'deleted_at'})
    deletedAt?: Date | null;
}