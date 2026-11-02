import { ApiProperty } from "@nestjs/swagger";

export class SavingsGoalResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ example: 'Apport voiture' })
    label?: string;

    @ApiProperty({ example: 20000, description: 'Amount put aside each month, in the smallest unit of the user primary currency' })
    monthlyContribution?: number;

    @ApiProperty({ example: 300000, nullable: true })
    targetAmount?: number | null;

    @ApiProperty({ example: '2027-10-01', format: 'date', nullable: true })
    targetDate?: string | null;

    @ApiProperty({ example: 28, nullable: true, description: 'Day of the monthly contribution, null to follow the day of the main fixed income' })
    dayOfMonth?: number | null;

    @ApiProperty({ example: true, description: 'false for a plain recurring transfer without target, derived from targetAmount' })
    hasGoal?: boolean;

    @ApiProperty({ example: 120000, description: 'Sum of the confirmed contributions, never stored' })
    currentAmount?: number;

    @ApiProperty({ example: 40, nullable: true, description: 'currentAmount / targetAmount as an integer between 0 and 100, null without target' })
    progressPct?: number | null;

    @ApiProperty({ example: '2027-08', nullable: true, description: 'Month (YYYY-MM) the target is reached at monthlyContribution per month from the current month, null without target or once reached' })
    projectedMonth?: string | null;

    @ApiProperty({ format: 'uuid', nullable: true, description: 'Savings account the contributions are transferred to, null to debit the source account only' })
    accountId?: string | null;

    @ApiProperty()
    createdAt?: Date;
}
