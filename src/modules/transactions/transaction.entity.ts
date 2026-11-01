import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { User } from "../users/user.entity";
import { Account } from "../accounts/account.entity";
import { Category } from "../categories/category.entity";
import { TransactionSourceType } from "./types";
import { Provision } from "../provisions/provision.entity";

@Entity('transactions')
@Index('IDX_transactions_user_occurred_on', ['userId', 'occurredOn'])
@Index('IDX_transactions_account_occurred_on', ['accountId', 'occurredOn'])
@Index('IDX_transactions_category_occurred_on', ['categoryId', 'occurredOn'])
@Index('IDX_transactions_provision', ['provisionId'])
export class Transaction extends AbstractEntity {
    @Column({ type: 'int' })
    amount?: number;

    @Column({ type: 'varchar', nullable: true })
    merchant?: string | null;

    @Column({ type: 'text', nullable: true })
    note?: string | null;

    @Column({ type: 'varchar', array: true, default: [] })
    tags?: string[];

    @Column({ type: 'date' })
    occurredOn?: string;

    @Column({ type: 'enum', enum: TransactionSourceType, default: TransactionSourceType.MANUAL })
    sourceType?: TransactionSourceType;

    // Required on creation, set to null when the account is deleted to keep the budget history
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

    // Set by the server when the transaction settles a provision, kept null when the provision is deleted
    @Column({ type: 'uuid', nullable: true })
    provisionId?: string | null;

    @ManyToOne(() => Provision, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'provisionId' })
    provision?: Provision | null;

    @Column()
    userId?: string;

    @ManyToOne(() => User, (user) => user.transactions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}
