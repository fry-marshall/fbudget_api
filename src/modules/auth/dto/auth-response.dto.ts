import { IsNotEmpty, IsString } from "class-validator";


export class AuthResponseDto {
    accessToken?: string;
    refreshToken?: string;
}