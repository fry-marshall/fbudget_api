import { Body, Controller, Post } from "@nestjs/common";
import { AuthGoogleDto } from "./dto/auth-google.dto";
import { AuthService } from "./auth.service";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { AuthEmailDto } from "./dto/auth-email.dto";
import { RequestOtpDto } from "./dto/request-otp.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";

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

    @Post('request-otp')
    requestOtp(@Body() requestOtpDto: RequestOtpDto): Promise<{ message: string }> {
        return this.authService.requestOtp(requestOtpDto.email!);
    }

    @Post('verify-otp')
    verifyOtp(@Body() verifyOtpDto: VerifyOtpDto): Promise<AuthResponseDto> {
        return this.authService.verifyOtp(verifyOtpDto.email!, verifyOtpDto.code!);
    }

}