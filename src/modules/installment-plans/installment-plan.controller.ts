import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { UuidParamPipe } from "src/common/pipes/uuid-param.pipe";
import { MessageResponseDto } from "src/common/dto/message-response.dto";
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessArrayResponse, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { InstallmentPlanService } from "./installment-plan.service";
import { InstallmentPlanResponseDto } from "./dto/installment-plan-response.dto";
import { InstallmentResponseDto } from "./dto/installment-response.dto";
import { CreateInstallmentPlanDto } from "./dto/create-installment-plan.dto";
import { UpdateInstallmentPlanDto } from "./dto/update-installment-plan.dto";
import { PayInstallmentDto } from "./dto/pay-installment.dto";
import { PayInstallmentResponseDto } from "./dto/pay-installment-response.dto";

@ApiTags('installment-plans')
@ApiAuthResponses()
@UseGuards(JwtGuard)
@Controller('installment-plans')
export class InstallmentPlanController {

    constructor(
        private installmentPlanService: InstallmentPlanService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'List the active and completed installment plans of the connected user, oldest first' })
    @ApiSuccessArrayResponse(InstallmentPlanResponseDto)
    findAll(@CurrentUser() user: PayloadJwt): Promise<InstallmentPlanResponseDto[]> {
        return this.installmentPlanService.findAll(user.id!)
    }

    @Post()
    @ApiOperation({ summary: 'Create an installment plan and generate its monthly installments' })
    @ApiSuccessResponse(InstallmentPlanResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.AUTH.USER_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND} | ${ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND}`, type: ErrorResponse })
    create(@CurrentUser() user: PayloadJwt, @Body() createInstallmentPlanDto: CreateInstallmentPlanDto): Promise<InstallmentPlanResponseDto> {
        return this.installmentPlanService.create(user.id!, createInstallmentPlanDto)
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update the label, the provider, the account or the category of an installment plan, or cancel it' })
    @ApiSuccessResponse(InstallmentPlanResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND} | ${ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND}`, type: ErrorResponse })
    @ApiConflictResponse({ description: ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_CANCELLED, type: ErrorResponse })
    update(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() updateInstallmentPlanDto: UpdateInstallmentPlanDto): Promise<InstallmentPlanResponseDto> {
        return this.installmentPlanService.update(user.id!, id, updateInstallmentPlanDto)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete an installment plan and its installments, the payment transactions are kept' })
    @ApiSuccessResponse(MessageResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND, type: ErrorResponse })
    remove(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<MessageResponseDto> {
        return this.installmentPlanService.remove(user.id!, id)
    }

    @Get(':id/installments')
    @ApiOperation({ summary: 'List the installments of a plan with their paid, due or future status' })
    @ApiSuccessArrayResponse(InstallmentResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND, type: ErrorResponse })
    findInstallments(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<InstallmentResponseDto[]> {
        return this.installmentPlanService.findInstallments(user.id!, id)
    }

    @Post(':id/installments/:installmentId/pay')
    @ApiOperation({ summary: 'Pay an installment: confirm its pending transaction generated for the month with the day and account sent, or create the expense transaction with sourceType installment' })
    @ApiSuccessResponse(PayInstallmentResponseDto, 201)
    @ApiBadRequestResponse({ description: `${ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST} | ${ERRORS_MESSAGES.INSTALLMENT_PLANS.ACCOUNT_REQUIRED}`, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_NOT_FOUND} | ${ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND}`, type: ErrorResponse })
    @ApiConflictResponse({ description: `${ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_PLAN_CANCELLED} | ${ERRORS_MESSAGES.INSTALLMENT_PLANS.INSTALLMENT_ALREADY_PAID}`, type: ErrorResponse })
    pay(
        @CurrentUser() user: PayloadJwt,
        @Param('id', UuidParamPipe) id: string,
        @Param('installmentId', UuidParamPipe) installmentId: string,
        @Body() payInstallmentDto: PayInstallmentDto
    ): Promise<PayInstallmentResponseDto> {
        return this.installmentPlanService.pay(user.id!, id, installmentId, payInstallmentDto)
    }
}
