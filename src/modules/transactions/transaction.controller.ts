import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { UuidParamPipe } from "src/common/pipes/uuid-param.pipe";
import { MessageResponseDto } from "src/common/dto/message-response.dto";
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
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

    @Post()
    @ApiOperation({ summary: 'Record an expense (negative amount) or an income (positive amount) on an account of the connected user' })
    @ApiSuccessResponse(TransactionResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.AUTH.USER_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND} | ${ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND}`, type: ErrorResponse })
    create(@CurrentUser() user: PayloadJwt, @Body() createTransactionDto: CreateTransactionDto): Promise<TransactionResponseDto> {
        return this.transactionService.create(user.id!, createTransactionDto)
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a transaction of the connected user' })
    @ApiSuccessResponse(TransactionResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND} | ${ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND}`, type: ErrorResponse })
    update(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() updateTransactionDto: UpdateTransactionDto): Promise<TransactionResponseDto> {
        return this.transactionService.update(user.id!, id, updateTransactionDto)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a transaction of the connected user' })
    @ApiSuccessResponse(MessageResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.TRANSACTIONS.TRANSACTION_NOT_FOUND, type: ErrorResponse })
    remove(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<MessageResponseDto> {
        return this.transactionService.remove(user.id!, id)
    }
}
