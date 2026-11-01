import { ApiProperty } from "@nestjs/swagger";
import { TransactionResponseDto } from "src/modules/transactions/dto/transaction-response.dto";
import { InstallmentResponseDto } from "./installment-response.dto";

export class PayInstallmentResponseDto {
    @ApiProperty({ type: InstallmentResponseDto, description: 'The installment, now paid' })
    installment?: InstallmentResponseDto;

    @ApiProperty({ type: TransactionResponseDto, description: 'The expense created, with sourceType installment' })
    transaction?: TransactionResponseDto;
}
