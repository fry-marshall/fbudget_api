import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { UuidParamPipe } from "src/common/pipes/uuid-param.pipe";
import { MessageResponseDto } from "src/common/dto/message-response.dto";
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessArrayResponse, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { TransactionService } from "./transaction.service";
import { TransactionResponseDto } from "./dto/transaction-response.dto";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { UpdateTransactionDto } from "./dto/update-transaction.dto";
import { FindTransactionsQueryDto } from "./dto/find-transactions-query.dto";
import { ConfirmTransactionDto } from "./dto/confirm-transaction.dto";
import { ConfirmTransactionsDto } from "./dto/confirm-transactions.dto";

@ApiTags('transactions')
@ApiAuthResponses()
@UseGuards(JwtGuard)
@Controller('transactions')
export class TransactionController {

    constructor(
        private transactionService: TransactionService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'List the connected user transactions of a month, optionally filtered by account and category, most recent first' })
    @ApiSuccessArrayResponse(TransactionResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    findAll(@CurrentUser() user: PayloadJwt, @Query() query: FindTransactionsQueryDto): Promise<TransactionResponseDto[]> {
        return this.transactionService.findAll(user.id!, query)
    }

    @Get('pending')
    @ApiOperation({ summary: 'List the connected user pending transactions to validate, from the 1st of the previous month to the end of the current month, oldest first' })
    @ApiSuccessArrayResponse(TransactionResponseDto)
    findPending(@CurrentUser() user: PayloadJwt): Promise<TransactionResponseDto[]> {
        return this.transactionService.findPending(user.id!)
    }

    @Post('confirm')
    @HttpCode(200)
    @ApiOperation({ summary: 'Confirm several pending transactions of the connected user with their planned amount and day, with the other transaction of their transfers. The already confirmed ones are ignored, only the newly confirmed transactions are returned' })
    @ApiSuccessArrayResponse(TransactionResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND}, nothing is confirmed`, type: ErrorResponse })
    confirmMany(@CurrentUser() user: PayloadJwt, @Body() confirmTransactionsDto: ConfirmTransactionsDto): Promise<TransactionResponseDto[]> {
        return this.transactionService.confirmMany(user.id!, confirmTransactionsDto)
    }

    @Post()
    @ApiOperation({ summary: 'Record an expense (negative amount) or an income (positive amount) on an account of the connected user' })
    @ApiSuccessResponse(TransactionResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.AUTH.USER_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND} | ${ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND}`, type: ErrorResponse })
    create(@CurrentUser() user: PayloadJwt, @Body() createTransactionDto: CreateTransactionDto): Promise<TransactionResponseDto> {
        return this.transactionService.create(user.id!, createTransactionDto)
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a transaction of the connected user, only the merchant, note and tags of a transfer can be changed' })
    @ApiSuccessResponse(TransactionResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND} | ${ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND}`, type: ErrorResponse })
    @ApiConflictResponse({ description: ERRORS_MESSAGES.TRANSACTIONS.TRANSFER_NOT_EDITABLE, type: ErrorResponse })
    update(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() updateTransactionDto: UpdateTransactionDto): Promise<TransactionResponseDto> {
        return this.transactionService.update(user.id!, id, updateTransactionDto)
    }

    @Put(':id/confirm')
    @ApiOperation({ summary: 'Confirm a pending transaction of the connected user, optionally with its actual amount (without sign) and day. Both transactions of a transfer are confirmed together' })
    @ApiSuccessResponse(TransactionResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND, type: ErrorResponse })
    @ApiConflictResponse({ description: ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_ALREADY_CONFIRMED, type: ErrorResponse })
    confirm(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() confirmTransactionDto: ConfirmTransactionDto): Promise<TransactionResponseDto> {
        return this.transactionService.confirm(user.id!, id, confirmTransactionDto)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a transaction of the connected user, both transactions of a transfer are deleted together' })
    @ApiSuccessResponse(MessageResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND, type: ErrorResponse })
    remove(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<MessageResponseDto> {
        return this.transactionService.remove(user.id!, id)
    }
}
