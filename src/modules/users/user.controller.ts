import { Body, Controller, Delete, Get, Put, Request, UseGuards } from "@nestjs/common";
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { UserService } from "./user.service";
import { UserResponseDto } from "./dto/user-response.dto";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { UpdateUserDto } from "./dto/update-user.dto";
import type { PayloadJwt } from "src/common/interfaces";
import { UpdateSettingsDto } from "../settings/dto/update-settings.dto";
import { SettingsResponseDto } from "../settings/dto/settings-response.dto";
import { ApiAuthResponses, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { MessageResponseDto } from "src/common/dto/message-response.dto";
import { ERRORS_MESSAGES } from "src/common/constants";

@ApiTags('users')
@ApiAuthResponses()
@Controller('users')
export class UserController {

    constructor(
        private userService: UserService
    ) { }

    @Get('me')
    @UseGuards(JwtGuard)
    @ApiOperation({ summary: 'Get the connected user with their settings' })
    @ApiSuccessResponse(UserResponseDto)
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.AUTH.USER_NOT_FOUND, type: ErrorResponse })
    getMe(@CurrentUser() user: PayloadJwt): Promise<UserResponseDto> {
        return this.userService.getMe(user.id!);
    }

    @Put('me')
    @UseGuards(JwtGuard)
    @ApiOperation({ summary: 'Update the connected user profile' })
    @ApiSuccessResponse(UserResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.AUTH.USER_NOT_FOUND, type: ErrorResponse })
    updateMe(@CurrentUser() user: PayloadJwt, @Body() updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
        return this.userService.updateMe(user.id!, updateUserDto)
    }

    @Delete('me')
    @UseGuards(JwtGuard)
    @ApiOperation({ summary: 'Permanently delete the connected user account with its settings and refresh tokens' })
    @ApiSuccessResponse(MessageResponseDto)
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.AUTH.USER_NOT_FOUND, type: ErrorResponse })
    deleteMe(@CurrentUser() user: PayloadJwt): Promise<MessageResponseDto> {
        return this.userService.deleteMe(user.id!)
    }

    @Put('me/settings')
    @UseGuards(JwtGuard)
    @ApiOperation({ summary: 'Update the connected user settings, the primary currency can only be set once' })
    @ApiSuccessResponse(SettingsResponseDto)
    @ApiBadRequestResponse({ description: `${ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST} | ${ERRORS_MESSAGES.SETTINGS.PRIMARY_CURRENCY_ALREADY_SET}`, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.AUTH.USER_NOT_FOUND} | ${ERRORS_MESSAGES.SETTINGS.SETTINGS_NOT_FOUND}`, type: ErrorResponse })
    updateSettings(@CurrentUser() user: PayloadJwt, @Body() updateSettingsDto: UpdateSettingsDto): Promise<SettingsResponseDto> {
        return this.userService.updateSettings(user.id!, updateSettingsDto)
    }
}
