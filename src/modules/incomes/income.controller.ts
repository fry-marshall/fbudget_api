import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { UuidParamPipe } from "src/common/pipes/uuid-param.pipe";
import { MessageResponseDto } from "src/common/dto/message-response.dto";
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessArrayResponse, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { IncomeService } from "./income.service";
import { IncomeResponseDto } from "./dto/income-response.dto";
import { CreateIncomeDto } from "./dto/create-income.dto";
import { UpdateIncomeDto } from "./dto/update-income.dto";

@ApiTags('incomes')
@ApiAuthResponses()
@UseGuards(JwtGuard)
@Controller('incomes')
export class IncomeController {

    constructor(
        private incomeService: IncomeService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'List the connected user incomes, oldest first' })
    @ApiSuccessArrayResponse(IncomeResponseDto)
    findAll(@CurrentUser() user: PayloadJwt): Promise<IncomeResponseDto[]> {
        return this.incomeService.findAll(user.id!)
    }

    @Post()
    @ApiOperation({ summary: 'Create an income, optionally linked to an account of the connected user' })
    @ApiSuccessResponse(IncomeResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.AUTH.USER_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND}`, type: ErrorResponse })
    create(@CurrentUser() user: PayloadJwt, @Body() createIncomeDto: CreateIncomeDto): Promise<IncomeResponseDto> {
        return this.incomeService.create(user.id!, createIncomeDto)
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update an income of the connected user' })
    @ApiSuccessResponse(IncomeResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.INCOMES.INCOME_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND}`, type: ErrorResponse })
    update(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() updateIncomeDto: UpdateIncomeDto): Promise<IncomeResponseDto> {
        return this.incomeService.update(user.id!, id, updateIncomeDto)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete an income of the connected user' })
    @ApiSuccessResponse(MessageResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.INCOMES.INCOME_NOT_FOUND, type: ErrorResponse })
    remove(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<MessageResponseDto> {
        return this.incomeService.remove(user.id!, id)
    }
}
