import { getTokenExpiry } from "src/common/helpers/helpers";
import { RefreshToken } from "src/modules/refresh-tokens/refresh-token.entity";
import { AuthProvider } from "src/modules/users/types";
import { User } from "src/modules/users/user.entity";
import { DeepPartial } from "typeorm";
import { TestContext } from "./test-app";

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
 * Build a user with default values, ready to be saved with its settings
 */
export const buildUser = (overrides: DeepPartial<User> = {}): DeepPartial<User> => ({
    displayName: 'marshall',
    email: TEST_EMAIL,
    authProviders: [AuthProvider.EMAIL],
    settings: {},
    ...overrides
})

/**
 * Sign an access token the same way as AuthService
 */
export const signAccessToken = (
    { jwtService, configService }: TestContext,
    user: User,
    expiresIn: string | number = configService.get('ACCESS_TOKEN_EXPIRY')!
): string => jwtService.sign(
    { id: user.id, email: user.email },
    { secret: configService.get('ACCESS_TOKEN_SECRET'), expiresIn: expiresIn as any }
)

/**
 * Sign a refresh token the same way as AuthService
 */
export const signRefreshToken = (
    { jwtService, configService }: TestContext,
    user: User,
    expiresIn: string | number = configService.get('REFRESH_TOKEN_EXPIRY')!
): string => jwtService.sign(
    { id: user.id, email: user.email },
    { secret: configService.get('REFRESH_TOKEN_SECRET'), expiresIn: expiresIn as any }
)

/**
 * Save a user with a refresh token stored in database, as if they had just logged in
 */
export const createUserAndLogin = async (
    ctx: TestContext,
    overrides: DeepPartial<User> = {}
): Promise<{ user: User, accessToken: string, refreshToken: string }> => {
    const user = await ctx.repo(User).save(buildUser(overrides))

    const refreshToken = signRefreshToken(ctx, user)
    await ctx.repo(RefreshToken).save({
        token: refreshToken,
        expiresAt: getTokenExpiry(ctx.jwtService, refreshToken),
        user: { id: user.id }
    })

    return { user, accessToken: signAccessToken(ctx, user), refreshToken }
}
