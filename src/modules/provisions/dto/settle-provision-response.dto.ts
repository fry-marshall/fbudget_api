import { ApiProperty } from "@nestjs/swagger";
import { TransactionResponseDto } from "src/modules/transactions/dto/transaction-response.dto";
import { ProvisionResponseDto } from "./provision-response.dto";

export class SettleProvisionResponseDto {
    @ApiProperty({ type: ProvisionResponseDto, description: 'The provision with its next due date moved forward' })
    provision?: ProvisionResponseDto;

    @ApiProperty({ type: TransactionResponseDto, description: 'The expense created, with sourceType provision' })
    transaction?: TransactionResponseDto;
}
