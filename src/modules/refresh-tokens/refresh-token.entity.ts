import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "../users/user.entity";

@Entity('refresh_tokens')
export class RefreshToken {
    @PrimaryGeneratedColumn('uuid')
    id?: string;

    @Column({unique: true})
    token?: string

    @ManyToOne(() => User, (user) => user.refreshTokens)
    @JoinColumn()
    user?: User;
}