import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { GoogleService } from "src/common/services/google.service";
import { GoogleToken } from "src/common/interfaces/google-token.interface";
import { InjectRepository } from "@nestjs/typeorm";
import { User } from "../users/user.entity";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { generateOtp } from "src/common/helpers/helpers";
import { MailService } from "src/common/services/mail.service";
import { AuthProvider } from "../users/types";
import { RefreshTokenService } from "../refresh-tokens/refresh-token.service";

@Injectable()
export class AuthService {

    constructor(
        private googleService: GoogleService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private mailService: MailService,
        private refreshTokenService: RefreshTokenService,
        @InjectRepository(User)
        private userRepository: Repository<User>
    ) { }

    async googleAuthentication(idToken: string): Promise<AuthResponseDto> {
        const googleToken: GoogleToken = await this.googleService.verifyIdToken(idToken);
        const email = googleToken.payload?.email;
        const name = googleToken.payload?.name;
        let user = await this.userRepository.findOne({ where: { email } });

        if (!user) {
            user = await this.userRepository.save({
                email,
                displayName: name,
                authProvider: AuthProvider.GOOGLE
            });
        }

        const payload = {
            id: user.id,
            email: user.email,
        }

        const tokens = {
            accessToken: this.jwtService.sign(payload, { secret: this.configService.get('ACCESS_TOKEN_SECRET'), expiresIn: this.configService.get('ACCESS_TOKEN_EXPIRY') }),
            refreshToken: this.jwtService.sign(payload, { secret: this.configService.get('REFRESH_TOKEN_SECRET'), expiresIn: this.configService.get('REFRESH_TOKEN_EXPIRY') }),
        }

        return tokens;
    }

    async emailAuthentication(email: string): Promise<{ message: string }> {
        let user = await this.userRepository.findOne({ where: { email } });

        if (!user) {
            user = await this.userRepository.save({ email, authProvider: AuthProvider.EMAIL });
        }

        const otpCode = generateOtp();
        const expiredDateIn15Minutes = Date.now() + 900000

        await this.userRepository.update(user?.id!, {
            otpCode,
            otpExpiresAt: new Date(expiredDateIn15Minutes)
        });

        await this.mailService.sendMail({
            receiver: user.email,
            subject: 'Connexion à FBudget : Voici le code de vérification à 6 chiffres',
            context: {
                code: otpCode,
                name: user.displayName
            },
            template: 'otp-verification',
        })

        return {
            message: "OTP send successfully"
        };
    }

    async requestOtp(email: string): Promise<{ message: string }> {
        let user = await this.userRepository.findOne({ where: { email } });

        if (!user) {
            throw new NotFoundException('User not found')
        }

        const otpCode = generateOtp();
        const expiredDateIn15Minutes = Date.now() + 900000

        await this.userRepository.update(user?.id!, {
            otpCode,
            otpExpiresAt: new Date(expiredDateIn15Minutes)
        });

        await this.mailService.sendMail({
            receiver: user.email,
            subject: 'Connexion à FBudget : Voici le code de vérification à 6 chiffres',
            context: {
                code: otpCode,
                name: user.displayName
            },
            template: 'otp-verification',
        })

        return {
            message: "OTP send successfully"
        };
    }

    async verifyOtp(email: string, code: string): Promise<AuthResponseDto> {
        const now = Date.now()
        let user = await this.userRepository.findOne({ where: { email, otpCode: code } });

        if (!user) {
            throw new NotFoundException('User not found')
        }
        if (now > user.otpExpiresAt?.getTime()!) {
            throw new UnauthorizedException('Otp code is incorrect')
        }

        const payload = {
            id: user.id,
            email: user.email
        }

        const tokens = {
            accessToken: this.jwtService.sign(payload, { secret: this.configService.get('ACCESS_TOKEN_SECRET'), expiresIn: this.configService.get('ACCESS_TOKEN_EXPIRY') }),
            refreshToken: this.jwtService.sign(payload, { secret: this.configService.get('REFRESH_TOKEN_SECRET'), expiresIn: this.configService.get('REFRESH_TOKEN_EXPIRY') }),
        }

        return tokens;

    }

    async refreshToken(refreshTokenParam: string): Promise<AuthResponseDto> {
        const payload: { id: string, email: string } = await this.jwtService.verifyAsync(refreshTokenParam, { secret: this.configService.get('REFRESH_TOKEN_SECRET') })
        if (payload) {
            const user = await this.userRepository.findOne({ where: { id: payload.id } })

            if (!user) {
                throw new NotFoundException('User not found')
            }

            const refreshToken = await this.refreshTokenService.findUserRefreshToken(payload.id, refreshTokenParam)
            if (!refreshToken) {
                throw new UnauthorizedException('Refresh token not found')
            }
            else {
                const tokens = {
                    accessToken: this.jwtService.sign(payload, { secret: this.configService.get('ACCESS_TOKEN_SECRET'), expiresIn: this.configService.get('ACCESS_TOKEN_EXPIRY') }),
                    refreshToken: this.jwtService.sign(payload, { secret: this.configService.get('REFRESH_TOKEN_SECRET'), expiresIn: this.configService.get('REFRESH_TOKEN_EXPIRY') }),
                }
                await this.refreshTokenService.saveRefreshToken(payload.id, tokens.refreshToken);
                await this.refreshTokenService.removeRefreshToken(refreshTokenParam)

                return tokens;
            }
        }

        throw new UnauthorizedException('Refresh token is not valid')
    }
}