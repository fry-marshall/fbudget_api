import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "../users/user.entity";

@Entity('refresh_tokens')
export class RefreshToken {
    @PrimaryGeneratedColumn('uuid')
    id?: string;

    @Column({unique: true})
    token?: string

    @OneToOne(() => User)
    @JoinColumn()
    user?: User;
}