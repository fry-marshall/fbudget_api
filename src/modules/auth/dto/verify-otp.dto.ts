import { IsEmail, IsString, Matches } from "class-validator";

export class VerifyOtpDto {
    @IsEmail()
    email?: string;

    @IsString()
    @Matches(/^\d{6}$/)
    code?: string;
}
