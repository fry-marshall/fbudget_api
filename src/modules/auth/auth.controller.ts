import { Body, Controller, Post } from "@nestjs/common";
import { AuthGoogleDto } from "./dto/auth-google.dto";
import { AuthService } from "./auth.service";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { AuthEmailDto } from "./dto/auth-email.dto";

@Controller('auth')
export class AuthController {

    constructor(
        private authService: AuthService,
    ) { }

    @Post('google')
    googleAuthentication(@Body() authGoogleDto: AuthGoogleDto): Promise<AuthResponseDto> {
        return this.authService.googleAuthentication(authGoogleDto.idToken!);
    }

    @Post('email')
    emailAuthentication(@Body() authEmailDto: AuthEmailDto): Promise<{ message: string }> {
        return this.authService.emailAuthentication(authEmailDto.email!);
    }

}