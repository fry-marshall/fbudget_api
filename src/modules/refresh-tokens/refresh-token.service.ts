import { Injectable } from "@nestjs/common";
import { Repository } from "typeorm";
import { RefreshToken } from "./refresh-token.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { getTokenExpiry } from "src/common/helpers/helpers";

@Injectable()
export class RefreshTokenService {

    constructor(
        @InjectRepository(RefreshToken)
        private refreshTokenRepository: Repository<RefreshToken>,
        private jwtService: JwtService
    ){}

    async findUserRefreshToken(userId: string, token: string): Promise<RefreshToken | null> {
        return await this.refreshTokenRepository.findOne({
            where: {
                token,
                user: {
                    id: userId
                }
            }
        })
    }

    async removeRefreshToken(token: string): Promise<void> {
        await this.refreshTokenRepository.delete({ token })
    }

    async removeUserRefreshTokens(userId: string): Promise<void> {
        await this.refreshTokenRepository.delete({ user: { id: userId } })
    }

    /**
     * Save the refresh token with the expiry of its exp claim, so it always matches the JWT
     */
    async saveRefreshToken(userId: string, token: string): Promise<void> {
        await this.refreshTokenRepository.save({
            token,
            expiresAt: getTokenExpiry(this.jwtService, token),
            user: {
                id: userId
            }
        })
    }
}