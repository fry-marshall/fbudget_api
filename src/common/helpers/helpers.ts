import { JwtService } from "@nestjs/jwt";


/**
 * Generate a 6 digits otp
 */
export const generateOtp = () => {
    return (Math.random()*899999 + 100000).toFixed(0)
}

/**
 * Read the expiry date from the exp claim of a JWT
 */
export const getTokenExpiry = (jwtService: JwtService, token: string): Date =>
    new Date(jwtService.decode<{ exp: number }>(token).exp * 1000)