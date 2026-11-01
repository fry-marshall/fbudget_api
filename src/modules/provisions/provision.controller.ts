import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { UuidParamPipe } from "src/common/pipes/uuid-param.pipe";
import { MessageResponseDto } from "src/common/dto/message-response.dto";
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessArrayResponse, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { TransactionResponseDto } from "../transactions/dto/transaction-response.dto";
import { ProvisionService } from "./provision.service";
import { ProvisionResponseDto } from "./dto/provision-response.dto";
import { CreateProvisionDto } from "./dto/create-provision.dto";
import { UpdateProvisionDto } from "./dto/update-provision.dto";
import { SettleProvisionDto } from "./dto/settle-provision.dto";
import { SettleProvisionResponseDto } from "./dto/settle-provision-response.dto";

@ApiTags('provisions')
@ApiAuthResponses()
@UseGuards(JwtGuard)
@Controller('provisions')
export class ProvisionController {

    constructor(
        private provisionService: ProvisionService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'List the active and paused provisions of the connected user, next due date first' })
    @ApiSuccessArrayResponse(ProvisionResponseDto)
    findAll(@CurrentUser() user: PayloadJwt): Promise<ProvisionResponseDto[]> {
        return this.provisionService.findAll(user.id!)
    }

    @Post()
    @ApiOperation({ summary: 'Create an active provision, optionally linked to an account and a category of the connected user' })
    @ApiSuccessResponse(ProvisionResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.AUTH.USER_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND} | ${ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND}`, type: ErrorResponse })
    create(@CurrentUser() user: PayloadJwt, @Body() createProvisionDto: CreateProvisionDto): Promise<ProvisionResponseDto> {
        return this.provisionService.create(user.id!, createProvisionDto)
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a provision of the connected user: postpone it with a new nextDueDate, pause, resume or cancel it with status' })
    @ApiSuccessResponse(ProvisionResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND} | ${ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND}`, type: ErrorResponse })
    @ApiConflictResponse({ description: ERRORS_MESSAGES.PROVISIONS.PROVISION_CANCELLED, type: ErrorResponse })
    update(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() updateProvisionDto: UpdateProvisionDto): Promise<ProvisionResponseDto> {
        return this.provisionService.update(user.id!, id, updateProvisionDto)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a provision of the connected user, its settlement transactions are kept without provision' })
    @ApiSuccessResponse(MessageResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND, type: ErrorResponse })
    remove(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<MessageResponseDto> {
        return this.provisionService.remove(user.id!, id)
    }

    @Post(':id/settle')
    @ApiOperation({ summary: 'Mark the current due date as paid: create the expense transaction and move the next due date forward by frequencyMonths' })
    @ApiSuccessResponse(SettleProvisionResponseDto, 201)
    @ApiBadRequestResponse({ description: `${ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST} | ${ERRORS_MESSAGES.PROVISIONS.ACCOUNT_REQUIRED}`, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND}`, type: ErrorResponse })
    @ApiConflictResponse({ description: ERRORS_MESSAGES.PROVISIONS.PROVISION_CANCELLED, type: ErrorResponse })
    settle(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() settleProvisionDto: SettleProvisionDto): Promise<SettleProvisionResponseDto> {
        return this.provisionService.settle(user.id!, id, settleProvisionDto)
    }

    @Get(':id/settlements')
    @ApiOperation({ summary: 'List the payments of a provision, whatever their month, most recent first' })
    @ApiSuccessArrayResponse(TransactionResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.PROVISIONS.PROVISION_NOT_FOUND, type: ErrorResponse })
    findSettlements(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<TransactionResponseDto[]> {
        return this.provisionService.findSettlements(user.id!, id)
    }
}
