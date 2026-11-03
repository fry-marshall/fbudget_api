import { ApiProperty } from "@nestjs/swagger";
import { CategoryPacingDto } from "./category-pacing.dto";

/**
 * Where the user stands in a month, amounts in the smallest unit of the user primary currency, computed from the current rules and the confirmed manual transactions, never stored
 */
export class BudgetDashboardResponseDto {
    @ApiProperty({ example: '2027-03' })
    month?: string;

    @ApiProperty({ example: 42000, description: 'freeAmount of GET budget/summary: what is free to live before any expense' })
    monthBudget?: number;

    @ApiProperty({ example: 15300, description: 'Sum of the monthly amounts of the active provisions, already deducted from monthBudget' })
    provisionSmoothing?: number;

    @ApiProperty({ example: 14830, description: 'Net of the confirmed manual transactions of the month, a refund lowers it, never below 0. Generated transactions and transfers are already in the budget' })
    spentThisMonth?: number;

    @ApiProperty({ example: 27170, description: 'monthBudget minus spentThisMonth, negative when overspending' })
    freeAmount?: number;

    @ApiProperty({ type: Number, nullable: true, example: 35, description: 'spentThisMonth × 100 / monthBudget rounded down, can exceed 100, null without positive budget' })
    pacingPct?: number | null;

    @ApiProperty({ example: 21103, description: 'freeAmount at the end of the month if the user keeps spending at the same pace' })
    projectedBalance?: number;

    @ApiProperty({ example: 22, description: 'Days of the month started on the current day (UTC), today included: all of them for a past month, 0 for a future one' })
    daysElapsed?: number;

    @ApiProperty({ example: 31 })
    daysInMonth?: number;

    @ApiProperty({ type: [CategoryPacingDto], description: 'Every category of the user, oldest first. The expenses without category count in spentThisMonth only' })
    categories?: CategoryPacingDto[];
}
