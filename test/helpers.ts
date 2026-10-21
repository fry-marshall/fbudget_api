import { User } from "src/modules/users/user.entity";

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
