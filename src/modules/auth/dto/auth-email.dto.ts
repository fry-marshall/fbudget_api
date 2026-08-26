import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class AuthEmailDto {
    @IsEmail()
    email?: string;
}