import { ApiProperty } from "@nestjs/swagger";

/**
 * Amounts in the smallest unit of the user primary currency, computed from the current rules of the user, never stored
 */
export class BudgetSummaryResponseDto {
    @ApiProperty({ example: '2026-11' })
    month?: string;

    @ApiProperty({ example: 30 })
    daysInMonth?: number;

    @ApiProperty({ example: 248000, description: 'Sum of the incomes, the variable ones with their estimated amount' })
    monthlyIncome?: number;

    @ApiProperty({ example: 119600, description: 'Sum of the fixed charges' })
    fixedCharges?: number;

    @ApiProperty({ example: 15334, description: 'Sum of the monthly amounts of the active provisions' })
    provisionSmoothing?: number;

    @ApiProperty({ example: 27650, description: 'Sum of the installments due in the month of the active installment plans' })
    installmentsDueThisMonth?: number;

    @ApiProperty({ example: 20000, description: 'Sum of the monthly contributions of the savings goals' })
    savingsContribution?: number;

    @ApiProperty({ example: 65416, description: 'What is really free to live: monthlyIncome minus all the other amounts, negative when the commitments exceed the incomes' })
    freeAmount?: number;

    @ApiProperty({ example: 2180, description: 'freeAmount / daysInMonth rounded down' })
    perDay?: number;
}
