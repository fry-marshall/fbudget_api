import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class AuthEmailDto {
    @ApiProperty({ example: 'john@example.com' })
    @IsEmail()
    email?: string;
}
