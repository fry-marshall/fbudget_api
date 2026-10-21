import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import { Repository } from "typeorm";

export const TEST_EMAIL = 'test@gmail.com';
export const OTP_VALIDITY_MS = 15 * 60_000;

/**
 * Check the OTP is a 6 digits code expiring in ~15 minutes
 */
export const expectValidOtp = (user: User | null) => {
    expect(user?.otpCode).toMatch(/^\d{6}$/)

    const expiresIn = user!.otpExpiresAt!.getTime() - Date.now()
    expect(expiresIn).toBeGreaterThan(OTP_VALIDITY_MS - 60_000)
    expect(expiresIn).toBeLessThanOrEqual(OTP_VALIDITY_MS)
}

/**
 * Create a user and a refresh token stored in database, signed the same way as AuthService
 */
export const createUserWithRefreshToken = async (
    userRepository: Repository<User>,
    refreshTokenRepository: Repository<RefreshToken>,
    jwtService: JwtService,
    configService: ConfigService,
    authProvider: AuthProvider = AuthProvider.EMAIL
): Promise<{ user: User, refreshToken: string }> => {
    const user = await userRepository.save({
        displayName: 'marshall',
        email: TEST_EMAIL,
        authProviders: [authProvider],
        settings: {}
    });

    const refreshToken = jwtService.sign(
        { id: user.id, email: user.email },
        { secret: configService.get('REFRESH_TOKEN_SECRET'), expiresIn: configService.get('REFRESH_TOKEN_EXPIRY') }
    )
    await refreshTokenRepository.save({ token: refreshToken, user: { id: user.id } })

    return { user, refreshToken }
}

/**
 * Sign an access token the same way as AuthService
 */
export const signAccessToken = (
    jwtService: JwtService,
    configService: ConfigService,
    user: User,
    expiresIn: string | number = configService.get('ACCESS_TOKEN_EXPIRY')!
): string => jwtService.sign(
    { id: user.id, email: user.email },
    { secret: configService.get('ACCESS_TOKEN_SECRET'), expiresIn: expiresIn as any }
)
