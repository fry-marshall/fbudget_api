import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class AuthGoogleDto {
    @ApiProperty({ description: 'Id token returned by the Google sign-in SDK' })
    @IsString()
    @IsNotEmpty()
    idToken?: string;
}
