import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";
import { MAX_INSTALLMENT_COUNT, MIN_INSTALLMENT_COUNT } from "../types";

export class CreateInstallmentPlanDto {
    @ApiProperty({ example: 'iPhone 15' })
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiPropertyOptional({ example: 'Klarna', nullable: true })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    provider?: string | null;

    @ApiProperty({ example: 75000, minimum: MIN_INSTALLMENT_COUNT, maximum: MAX_INT, description: 'Total price in the smallest unit of the user primary currency, at least one unit per installment' })
    @IsDefined()
    @IsInt()
    @Min(MIN_INSTALLMENT_COUNT)
    @Max(MAX_INT)
    totalAmount?: number;

    @ApiProperty({ example: 4, minimum: MIN_INSTALLMENT_COUNT, maximum: MAX_INSTALLMENT_COUNT, description: 'Number of monthly installments, cannot be changed after creation' })
    @IsDefined()
    @IsInt()
    @Min(MIN_INSTALLMENT_COUNT)
    @Max(MAX_INSTALLMENT_COUNT)
    installmentCount?: number;

    @ApiProperty({ example: '2026-11-15', format: 'date', description: 'Due date of the first installment, the next ones fall on the same day of the following months' })
    @IsDateOnly()
    firstDueDate?: string;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Account of the connected user debited by the installments' })
    @IsOptional()
    @IsUUID()
    accountId?: string | null;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Category of the connected user' })
    @IsOptional()
    @IsUUID()
    categoryId?: string | null;
}
