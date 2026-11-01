import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";

export class CreateTransferDto {
    @ApiProperty({ format: 'uuid', description: 'Account of the connected user debited' })
    @IsDefined()
    @IsUUID()
    fromAccountId?: string;

    @ApiProperty({ format: 'uuid', description: 'Account of the connected user credited, different from fromAccountId' })
    @IsDefined()
    @IsUUID()
    toAccountId?: string;

    @ApiProperty({ example: 5834, minimum: 1, maximum: MAX_INT, description: 'Amount moved, positive, in the smallest unit of the user primary currency' })
    @IsDefined()
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    amount?: number;

    @ApiProperty({ example: '2026-11-01', format: 'date', description: 'Day of the transfer' })
    @IsDateOnly()
    occurredOn?: string;

    @ApiPropertyOptional({ example: 'Provisions de novembre', nullable: true, description: 'Saved on both transactions' })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    note?: string | null;
}
