import { ApiProperty } from "@nestjs/swagger";
import { TransactionResponseDto } from "src/modules/transactions/dto/transaction-response.dto";
import { SavingsGoalResponseDto } from "./savings-goal-response.dto";

export class ContributeSavingsGoalResponseDto {
    @ApiProperty({ type: SavingsGoalResponseDto, description: 'The savings goal with its updated currentAmount' })
    savingsGoal?: SavingsGoalResponseDto;

    @ApiProperty({ type: TransactionResponseDto, description: 'The transfer created, negative with sourceType savings' })
    transaction?: TransactionResponseDto;
}
