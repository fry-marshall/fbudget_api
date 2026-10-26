import { ApiProperty } from "@nestjs/swagger";

export class AuthResponseDto {
    @ApiProperty({ description: 'JWT to send in the Authorization header' })
    accessToken?: string;

    @ApiProperty({ description: 'JWT to send to /auth/refresh and /auth/logout' })
    refreshToken?: string;
}
