import { IsNotEmpty, IsString } from "class-validator";


export class AuthGoogleDto {
    @IsString()
    @IsNotEmpty()
    idToken?: string;
}