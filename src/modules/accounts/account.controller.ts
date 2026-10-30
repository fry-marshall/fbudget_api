import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { UuidParamPipe } from "src/common/pipes/uuid-param.pipe";
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessArrayResponse, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { AccountService } from "./account.service";
import { AccountResponseDto } from "./dto/account-response.dto";
import { CreateAccountDto } from "./dto/create-account.dto";
import { UpdateAccountDto } from "./dto/update-account.dto";
import { MessageResponseDto } from "src/common/dto/message-response.dto";

@ApiTags('accounts')
@ApiAuthResponses()
@UseGuards(JwtGuard)
@Controller('accounts')
export class AccountController {

    constructor(
        private accountService: AccountService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'List the connected user accounts, oldest first' })
    @ApiSuccessArrayResponse(AccountResponseDto)
    findAll(@CurrentUser() user: PayloadJwt): Promise<AccountResponseDto[]> {
        return this.accountService.findAll(user.id!)
    }

    @Post()
    @ApiOperation({ summary: 'Create an account, the first one of the user becomes primary' })
    @ApiSuccessResponse(AccountResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.AUTH.USER_NOT_FOUND, type: ErrorResponse })
    create(@CurrentUser() user: PayloadJwt, @Body() createAccountDto: CreateAccountDto): Promise<AccountResponseDto> {
        return this.accountService.create(user.id!, createAccountDto)
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update an account of the connected user' })
    @ApiSuccessResponse(AccountResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND, type: ErrorResponse })
    update(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() updateAccountDto: UpdateAccountDto): Promise<AccountResponseDto> {
        return this.accountService.update(user.id!, id, updateAccountDto)
    }

    @Put(':id/set-primary')
    @ApiOperation({ summary: 'Make an account the primary one of the connected user, the previous primary account is unset' })
    @ApiSuccessResponse(AccountResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND, type: ErrorResponse })
    setPrimary(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<AccountResponseDto> {
        return this.accountService.setPrimary(user.id!, id)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete an account of the connected user, the oldest remaining account becomes primary if needed' })
    @ApiSuccessResponse(MessageResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND, type: ErrorResponse })
    remove(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<MessageResponseDto> {
        return this.accountService.remove(user.id!, id)
    }
}
