import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "../users/user.entity";

@Entity('refresh_tokens')
export class RefreshToken {
    @PrimaryGeneratedColumn('uuid')
    id?: string;

    @Column({unique: true})
    token?: string

    @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
    @JoinColumn()
    user?: User;

    @CreateDateColumn({type: 'timestamptz'})
    createdAt?: Date;

    @UpdateDateColumn({type: 'timestamptz'})
    updatedAt?: Date;
}