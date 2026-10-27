import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { AccountType } from "./types";
import { Currency } from "../settings/types";
import { User } from "../users/user.entity";

@Entity('accounts')
@Index('UQ_accounts_user_primary', ['userId'], { unique: true, where: '"isPrimary" = true' })
export class Account extends AbstractEntity {
    @Column({ type: 'enum', enum: AccountType })
    type?: AccountType;

    @Column({ nullable: true })
    operator?: string;

    @Column()
    name?: string;

    @Column({ type: 'char', length: 4, nullable: true })
    last4?: string;

    @Column({ type: 'varchar', length: 2, nullable: true })
    country?: string;

    @Column({ type: 'enum', enum: Currency })
    currency?: Currency;

    @Column({ type: 'int' })
    initialBalance?: number;

    @Column({ default: false })
    isPrimary?: boolean;

    @Column()
    userId?: string;

    @ManyToOne(() => User, (user) => user.accounts, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
