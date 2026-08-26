import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { GoogleService } from "src/common/services/google.service";
import { GoogleToken } from "src/common/interfaces/google-token.interface";
import { InjectRepository } from "@nestjs/typeorm";
import { User } from "../users/user.entity";
import { LessThan, Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AuthOtpDto } from "./dto/auth-otp.dto";
import { generateOtp } from "src/common/helpers/helpers";
import { MailService } from "src/common/services/mail.service";

@Injectable()
export class AuthService {

    constructor(
        private googleService: GoogleService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private mailService: MailService,
        @InjectRepository(User)
        private userRepository: Repository<User>
    ) { }

    async googleAuthentication(idToken: string): Promise<AuthResponseDto> {
        try {
            const googleToken: GoogleToken = await this.googleService.verifyIdToken(idToken);
            const email = googleToken.payload?.email;
            const name = googleToken.payload?.name;
            let user = await this.userRepository.findOne({ where: { email } });

            if (!user) {
                user = await this.userRepository.save({
                    email,
                    displayName: name
                });
            }

            const payload = {
                id: user.id,
                email: user.email,
            }

            const tokens = {
                accessToken: this.jwtService.sign(payload, { secret: this.configService.get('ACCESS_TOKEN_SECRET'), expiresIn: '7d' }),
                refreshToken: this.jwtService.sign(payload, { secret: this.configService.get('REFRESH_TOKEN_SECRET'), expiresIn: '30d' }),
            }

            return tokens;

        } catch (err) {
            throw err;
        }
    }

    async emailAuthentication(email: string): Promise<{ message: string }> {
        try {
            let user = await this.userRepository.findOne({ where: { email } });

            if (!user) {
                user = await this.userRepository.save({ email });
            }

            const otp = generateOtp();

            const expiredDateIn15Minutes = Date.now() + 900000

            await this.userRepository.update(user?.id!, {
                otp,
                otpExpiresAt: new Date(expiredDateIn15Minutes)
            });

            await this.mailService.sendMail({
                receiver: user.email,
                subject: 'Connexion à FBudget : Voici le code de vérification à 6 chiffres',
                context: {
                    code: otp,
                    name: user.displayName
                },
                template: 'otp-verification',
            })

            return {
                message: "OTP send successfully"
            };

        } catch (err) {
            throw err;
        }
    }

    async requestOtp(email: string): Promise<{ message: string }> {
        try {
            let user = await this.userRepository.findOne({ where: { email } });

            if (!user) {
                throw new NotFoundException('User not found')
            }

            const otp = generateOtp();

            await this.userRepository.update(user?.id!, {
                otp,
                otpExpiresAt: new Date()
            });

            await this.mailService.sendMail({
                receiver: user.email,
                subject: 'Connexion à FBudget : Voici le code de vérification à 6 chiffres',
                context: {
                    code: otp,
                    name: user.displayName
                },
                template: 'otp-verification',
            })

            return {
                message: "OTP send successfully"
            };

        } catch (err) {
            throw err;
        }
    }

    async verifyOtp(email: string, code: string): Promise<AuthResponseDto> {
        try {
            const now = Date.now()
            let user = await this.userRepository.findOne({ where: { email, otpCode: code } });

            if (!user) {
                throw new NotFoundException('User not found')
            }
            if(now > user.otpExpiresAt?.getTime()!){
                throw new UnauthorizedException('Otp code is incorrect')
            }

            const payload = {
                id: user.id,
                email: user.email
            }

            const tokens = {
                accessToken: this.jwtService.sign(payload, { secret: this.configService.get('ACCESS_TOKEN_SECRET'), expiresIn: '7d' }),
                refreshToken: this.jwtService.sign(payload, { secret: this.configService.get('REFRESH_TOKEN_SECRET'), expiresIn: '30d' }),
            }

            return tokens;

        } catch (err) {
            throw err;
        }
    }
}