import { Injectable } from "@nestjs/common";
import { Repository } from "typeorm";
import { RefreshToken } from "./refresh-token.entity";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class RefreshTokenService {

    constructor(
        @InjectRepository(RefreshToken)
        private refreshTokenRepository: Repository<RefreshToken>
    ){}

    async findUserRefreshToken(userId: string, token: string): Promise<RefreshToken | null> {
        return await this.refreshTokenRepository.findOne({
            where: {
                id: token,
                user: {
                    id: userId
                }
            }
        })
    }

    async removeRefreshToken(token: string): Promise<void> {
        await this.refreshTokenRepository.delete({ id: token })
    }

    async saveRefreshToken(userId: string, token: string): Promise<void> {
        await this.refreshTokenRepository.save({
            token,
            user: {
                id: userId
            }
        })
    }
}