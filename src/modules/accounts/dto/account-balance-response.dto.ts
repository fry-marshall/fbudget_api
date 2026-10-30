import { ApiProperty } from "@nestjs/swagger";

export class AccountBalanceResponseDto {
    @ApiProperty({ format: 'uuid' })
    accountId?: string;

    @ApiProperty({ example: 150000, description: 'Amount in the smallest unit of the user primary currency' })
    initialBalance?: number;

    @ApiProperty({ example: 107500, description: 'initialBalance plus the sum of the signed transaction amounts, in the smallest unit of the user primary currency' })
    balance?: number;
}
