import { ApiProperty } from "@nestjs/swagger";
import { TransactionResponseDto } from "src/modules/transactions/dto/transaction-response.dto";

export class TransferResponseDto {
    @ApiProperty({ format: 'uuid', description: 'Shared by the two transactions' })
    transferId?: string;

    @ApiProperty({ type: TransactionResponseDto, description: 'The debit of the source account, negative' })
    from?: TransactionResponseDto;

    @ApiProperty({ type: TransactionResponseDto, description: 'The credit of the destination account, positive' })
    to?: TransactionResponseDto;
}
