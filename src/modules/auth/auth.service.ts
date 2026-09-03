import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
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
import { ERRORS_MESSAGES } from "src/common/constants";

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
                authProviders: [AuthProvider.GOOGLE]
            });
        }
        else if (user && !user.authProviders?.includes(AuthProvider.GOOGLE)) {
            const authProviders: AuthProvider[] = [...user.authProviders!, AuthProvider.GOOGLE]
            await this.userRepository.update(user.id!, {
                authProviders
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

        await this.refreshTokenService.saveRefreshToken(user.id!, tokens.refreshToken)

        return tokens;
    }

    async emailAuthentication(email: string): Promise<{ message: string }> {
        let user = await this.userRepository.findOne({ where: { email } });

        if (!user) {
            user = await this.userRepository.save({ email, authProviders: [AuthProvider.EMAIL] });
        }
        else if (user && !user.authProviders?.includes(AuthProvider.EMAIL)) {
            const authProviders: AuthProvider[] = [...user.authProviders!, AuthProvider.EMAIL]
            await this.userRepository.update(user.id!, {
                authProviders
            });
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
            // To not let any attacker have the information this account exists or not
            return {
                message: "OTP send successfully"
            };
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
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        }
        if (now > user.otpExpiresAt?.getTime()!) {
            throw new UnauthorizedException(ERRORS_MESSAGES.AUTH.EXPIRED_OTP)
        }

        await this.userRepository.update(user.id!, {
            otpCode: null,
            otpExpiresAt: null,
        })

        const payload = {
            id: user.id,
            email: user.email
        }

        const tokens = {
            accessToken: this.jwtService.sign(payload, { secret: this.configService.get('ACCESS_TOKEN_SECRET'), expiresIn: this.configService.get('ACCESS_TOKEN_EXPIRY') }),
            refreshToken: this.jwtService.sign(payload, { secret: this.configService.get('REFRESH_TOKEN_SECRET'), expiresIn: this.configService.get('REFRESH_TOKEN_EXPIRY') }),
        }

        await this.refreshTokenService.saveRefreshToken(user.id!, tokens.refreshToken)

        return tokens;

    }

    async refreshToken(refreshTokenParam: string): Promise<AuthResponseDto> {
        try {
            const payload: { id: string, email: string } = await this.jwtService.verifyAsync(refreshTokenParam, { secret: this.configService.get('REFRESH_TOKEN_SECRET') })
            const user = await this.userRepository.findOne({ where: { id: payload.id } })

            if (!user) {
                throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            }

            const refreshToken = await this.refreshTokenService.findUserRefreshToken(payload.id, refreshTokenParam)
            if (!refreshToken) {
                throw new UnauthorizedException(ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND)
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
        } catch (err) {
            if (err instanceof UnauthorizedException || err instanceof NotFoundException || err instanceof BadRequestException) {
                throw err
            }
            throw new UnauthorizedException(ERRORS_MESSAGES.AUTH.INVALID_TOKEN)
        }
    }

    async logout(refreshTokenParam: string): Promise<{ message: string }> {
        try {
            const payload: { id: string, email: string } = await this.jwtService.verifyAsync(refreshTokenParam, { secret: this.configService.get('REFRESH_TOKEN_SECRET') })
            const user = await this.userRepository.findOne({ where: { id: payload.id } })

            if (!user) {
                throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
            }

            const refreshToken = await this.refreshTokenService.findUserRefreshToken(payload.id, refreshTokenParam)
            if (!refreshToken) {
                throw new UnauthorizedException(ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND)
            }

            await this.refreshTokenService.removeRefreshToken(refreshTokenParam)
            return { message: 'User logout successfully' }
        }
        catch (err) {
            if (err instanceof UnauthorizedException || err instanceof NotFoundException || err instanceof BadRequestException) {
                throw err
            }
            throw new UnauthorizedException(ERRORS_MESSAGES.AUTH.INVALID_TOKEN)
        }
    }
}