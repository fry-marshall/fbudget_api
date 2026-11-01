import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";
import { MAX_FREQUENCY_MONTHS, MIN_FREQUENCY_MONTHS } from "../types";

export class CreateProvisionDto {
    @ApiProperty({ example: 'Assurance auto' })
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiProperty({ example: 70000, minimum: 1, maximum: MAX_INT, description: 'Full amount paid at each due date, in the smallest unit of the user primary currency' })
    @IsDefined()
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    totalAmount?: number;

    @ApiProperty({ example: 12, minimum: MIN_FREQUENCY_MONTHS, maximum: MAX_FREQUENCY_MONTHS, description: 'Number of months between two due dates' })
    @IsDefined()
    @IsInt()
    @Min(MIN_FREQUENCY_MONTHS)
    @Max(MAX_FREQUENCY_MONTHS)
    frequencyMonths?: number;

    @ApiProperty({ example: '2027-03-15', format: 'date' })
    @IsDateOnly()
    nextDueDate?: string;

    @ApiProperty({ example: '2026-11-01', format: 'date', description: 'Day the smoothing starts, the local day of the user' })
    @IsDateOnly()
    startedAt?: string;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Account of the connected user paying the provision' })
    @IsOptional()
    @IsUUID()
    accountId?: string | null;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Category of the connected user' })
    @IsOptional()
    @IsUUID()
    categoryId?: string | null;
}
