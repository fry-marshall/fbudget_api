import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from "typeorm";
import { AbstractEntity } from "src/common/entities/abstract.entity";
import { User } from "../users/user.entity";

@Entity('refresh_tokens')
export class RefreshToken extends AbstractEntity {
    @Column({unique: true})
    token?: string

    @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
    @JoinColumn()
    user?: User;
}