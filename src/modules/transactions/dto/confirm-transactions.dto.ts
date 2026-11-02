import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from "class-validator";
import { MAX_CONFIRMED_TRANSACTIONS } from "../types/transaction.constants";

export class ConfirmTransactionsDto {
    @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: MAX_CONFIRMED_TRANSACTIONS, uniqueItems: true, description: 'Transactions of the connected user to confirm, the other transaction of a transfer is confirmed too' })
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(MAX_CONFIRMED_TRANSACTIONS)
    @ArrayUnique()
    @IsUUID(undefined, { each: true })
    ids?: string[];
}
