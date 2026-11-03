import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBadRequestResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { BudgetService } from "./budget.service";
import { BudgetMonthQueryDto } from "./dto/budget-month-query.dto";
import { BudgetSummaryResponseDto } from "./dto/budget-summary-response.dto";
import { BudgetDashboardResponseDto } from "./dto/budget-dashboard-response.dto";

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
    getSummary(@CurrentUser() user: PayloadJwt, @Query() { month }: BudgetMonthQueryDto): Promise<BudgetSummaryResponseDto> {
        return this.budgetService.getSummary(user.id!, month)
    }

    @Get('dashboard')
    @ApiOperation({ summary: 'Where the connected user stands in a month: free amount of the month minus the confirmed manual expenses, pacing, projection at the end of the month and expenses by category against their envelope' })
    @ApiSuccessResponse(BudgetDashboardResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    getDashboard(@CurrentUser() user: PayloadJwt, @Query() { month }: BudgetMonthQueryDto): Promise<BudgetDashboardResponseDto> {
        return this.budgetService.getDashboard(user.id!, month)
    }
}
