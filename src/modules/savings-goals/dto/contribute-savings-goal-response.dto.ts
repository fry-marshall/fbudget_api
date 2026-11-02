import { ApiProperty } from "@nestjs/swagger";
import { TransactionResponseDto } from "src/modules/transactions/dto/transaction-response.dto";
import { SavingsGoalResponseDto } from "./savings-goal-response.dto";

export class ContributeSavingsGoalResponseDto {
    @ApiProperty({ type: SavingsGoalResponseDto, description: 'The savings goal with its updated currentAmount' })
    savingsGoal?: SavingsGoalResponseDto;

    @ApiProperty({ type: TransactionResponseDto, description: 'The debit of the source account: one leg of a transfer to the savings account of the goal, or a negative transaction with sourceType savings for a goal without account' })
    transaction?: TransactionResponseDto;
}
