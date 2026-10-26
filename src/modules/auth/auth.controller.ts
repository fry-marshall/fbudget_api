import { Body, Controller, Post } from "@nestjs/common";
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { AuthGoogleDto } from "./dto/auth-google.dto";
import { AuthService } from "./auth.service";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { AuthEmailDto } from "./dto/auth-email.dto";
import { RequestOtpDto } from "./dto/request-otp.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { MessageResponseDto } from "src/common/dto/message-response.dto";
import { ERRORS_MESSAGES } from "src/common/constants";

@ApiTags('auth')
@Controller('auth')
export class AuthController {

    constructor(
        private authService: AuthService,
    ) { }

    @Post('google')
    @ApiOperation({ summary: 'Sign in or sign up with a Google id token' })
    @ApiSuccessResponse(AuthResponseDto, 201)
    @ApiBadRequestResponse({ description: `${ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST} | Invalid Google id token`, type: ErrorResponse })
    googleAuthentication(@Body() authGoogleDto: AuthGoogleDto): Promise<AuthResponseDto> {
        return this.authService.googleAuthentication(authGoogleDto.idToken!);
    }

    @Post('email')
    @ApiOperation({ summary: 'Create the account if needed and send an OTP by email' })
    @ApiSuccessResponse(MessageResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    emailAuthentication(@Body() authEmailDto: AuthEmailDto): Promise<MessageResponseDto> {
        return this.authService.emailAuthentication(authEmailDto.email!);
    }

    @Post('request-otp')
    @ApiOperation({ summary: 'Send a new OTP by email, same response whether the account exists or not' })
    @ApiSuccessResponse(MessageResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    requestOtp(@Body() requestOtpDto: RequestOtpDto): Promise<MessageResponseDto> {
        return this.authService.requestOtp(requestOtpDto.email!);
    }

    @Post('verify-otp')
    @ApiOperation({ summary: 'Verify the OTP and return a token pair' })
    @ApiSuccessResponse(AuthResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiUnauthorizedResponse({ description: ERRORS_MESSAGES.AUTH.EXPIRED_OTP, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.AUTH.USER_NOT_FOUND, type: ErrorResponse })
    verifyOtp(@Body() verifyOtpDto: VerifyOtpDto): Promise<AuthResponseDto> {
        return this.authService.verifyOtp(verifyOtpDto.email!, verifyOtpDto.code!);
    }

    @Post('refresh')
    @ApiOperation({ summary: 'Rotate the refresh token and return a new token pair' })
    @ApiSuccessResponse(AuthResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiUnauthorizedResponse({ description: `${ERRORS_MESSAGES.AUTH.INVALID_TOKEN} | ${ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND}`, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.AUTH.USER_NOT_FOUND, type: ErrorResponse })
    refreshToken(@Body() refreshTokenDto: RefreshTokenDto): Promise<AuthResponseDto> {
        return this.authService.refreshToken(refreshTokenDto.refreshToken!);
    }

    @Post('logout')
    @ApiOperation({ summary: 'Revoke the refresh token' })
    @ApiSuccessResponse(MessageResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiUnauthorizedResponse({ description: `${ERRORS_MESSAGES.AUTH.INVALID_TOKEN} | ${ERRORS_MESSAGES.AUTH.TOKEN_NOT_FOUND}`, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.AUTH.USER_NOT_FOUND, type: ErrorResponse })
    logout(@Body() refreshTokenDto: RefreshTokenDto): Promise<MessageResponseDto> {
        return this.authService.logout(refreshTokenDto.refreshToken!);
    }

}
