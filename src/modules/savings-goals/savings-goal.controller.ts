import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { UuidParamPipe } from "src/common/pipes/uuid-param.pipe";
import { MessageResponseDto } from "src/common/dto/message-response.dto";
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessArrayResponse, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { TransactionResponseDto } from "../transactions/dto/transaction-response.dto";
import { SavingsGoalService } from "./savings-goal.service";
import { SavingsGoalResponseDto } from "./dto/savings-goal-response.dto";
import { CreateSavingsGoalDto } from "./dto/create-savings-goal.dto";
import { UpdateSavingsGoalDto } from "./dto/update-savings-goal.dto";
import { ContributeSavingsGoalDto } from "./dto/contribute-savings-goal.dto";
import { ContributeSavingsGoalResponseDto } from "./dto/contribute-savings-goal-response.dto";

@ApiTags('savings-goals')
@ApiAuthResponses()
@UseGuards(JwtGuard)
@Controller('savings-goals')
export class SavingsGoalController {

    constructor(
        private savingsGoalService: SavingsGoalService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'List the savings goals of the connected user with their current amount, progress and projection, oldest first' })
    @ApiSuccessArrayResponse(SavingsGoalResponseDto)
    findAll(@CurrentUser() user: PayloadJwt): Promise<SavingsGoalResponseDto[]> {
        return this.savingsGoalService.findAll(user.id!)
    }

    @Post()
    @ApiOperation({ summary: 'Create a savings goal, without targetAmount for a plain recurring transfer, optionally linked to an account of the connected user' })
    @ApiSuccessResponse(SavingsGoalResponseDto, 201)
    @ApiBadRequestResponse({ description: `${ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST} | ${ERRORS_MESSAGES.SAVINGS_GOALS.TARGET_AMOUNT_REQUIRED}`, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.AUTH.USER_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND}`, type: ErrorResponse })
    create(@CurrentUser() user: PayloadJwt, @Body() createSavingsGoalDto: CreateSavingsGoalDto): Promise<SavingsGoalResponseDto> {
        return this.savingsGoalService.create(user.id!, createSavingsGoalDto)
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a savings goal of the connected user, a null targetAmount removes the target and requires a null targetDate' })
    @ApiSuccessResponse(SavingsGoalResponseDto)
    @ApiBadRequestResponse({ description: `${ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST} | ${ERRORS_MESSAGES.SAVINGS_GOALS.TARGET_AMOUNT_REQUIRED}`, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND}`, type: ErrorResponse })
    update(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() updateSavingsGoalDto: UpdateSavingsGoalDto): Promise<SavingsGoalResponseDto> {
        return this.savingsGoalService.update(user.id!, id, updateSavingsGoalDto)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a savings goal of the connected user, its contribution transactions are kept without savings goal' })
    @ApiSuccessResponse(MessageResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND, type: ErrorResponse })
    remove(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<MessageResponseDto> {
        return this.savingsGoalService.remove(user.id!, id)
    }

    @Post(':id/contributions')
    @ApiOperation({ summary: 'Record a transfer to a savings goal: create a negative transaction with sourceType savings debiting the account' })
    @ApiSuccessResponse(ContributeSavingsGoalResponseDto, 201)
    @ApiBadRequestResponse({ description: `${ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST} | ${ERRORS_MESSAGES.SAVINGS_GOALS.ACCOUNT_REQUIRED}`, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND}`, type: ErrorResponse })
    contribute(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() contributeSavingsGoalDto: ContributeSavingsGoalDto): Promise<ContributeSavingsGoalResponseDto> {
        return this.savingsGoalService.contribute(user.id!, id, contributeSavingsGoalDto)
    }

    @Get(':id/contributions')
    @ApiOperation({ summary: 'List the contributions of a savings goal, whatever their month, most recent first' })
    @ApiSuccessArrayResponse(TransactionResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.SAVINGS_GOALS.SAVINGS_GOAL_NOT_FOUND, type: ErrorResponse })
    findContributions(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<TransactionResponseDto[]> {
        return this.savingsGoalService.findContributions(user.id!, id)
    }
}
