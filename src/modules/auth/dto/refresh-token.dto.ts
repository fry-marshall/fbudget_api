import { IsEmail, IsNotEmpty, IsString, Length } from "class-validator";

export class RefreshTokenDto {
    @IsString()
    @IsNotEmpty()
    refreshToken?: string;
}