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

/**
 * Add months to a YYYY-MM-DD date, a day missing in the target month becomes its last day (2026-12-31 + 2 → 2027-02-28)
 */
export const addMonthsToDate = (date: string, months: number): string => {
    const [year, month, day] = date.split('-').map(Number)
    const targetMonthIndex = month - 1 + months
    // Day 0 of the following month is the last day of the target month
    const daysInTargetMonth = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate()
    const target = new Date(Date.UTC(year, targetMonthIndex, Math.min(day, daysInTargetMonth)))

    return target.toISOString().slice(0, 10)
}
