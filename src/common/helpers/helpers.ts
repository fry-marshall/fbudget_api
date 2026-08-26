
/**
 * Generate a 6 digits otp
 */
export const generateOtp = () => {
    return Math.random()*899999 + 100000
}