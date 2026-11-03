import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBadRequestResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { BudgetService } from "./budget.service";
import { BudgetSummaryQueryDto } from "./dto/budget-summary-query.dto";
import { BudgetSummaryResponseDto } from "./dto/budget-summary-response.dto";

@ApiTags('budget')
@ApiAuthResponses()
@UseGuards(JwtGuard)
@Controller('budget')
export class BudgetController {

    constructor(
        private budgetService: BudgetService,
    ) { }

    @Get('summary')
    @ApiOperation({ summary: 'What is really free to live in a month for the connected user: incomes minus fixed charges, smoothed provisions, installments due and savings, computed from the current rules' })
    @ApiSuccessResponse(BudgetSummaryResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    getSummary(@CurrentUser() user: PayloadJwt, @Query() { month }: BudgetSummaryQueryDto): Promise<BudgetSummaryResponseDto> {
        return this.budgetService.getSummary(user.id!, month)
    }
}
