import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsNotEmpty, IsString, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";
import { MAX_FREQUENCY_MONTHS, MIN_FREQUENCY_MONTHS, ProvisionStatus } from "../types";

export class UpdateProvisionDto {
    @ApiPropertyOptional({ example: 'Assurance auto' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiPropertyOptional({ example: 70000, minimum: 1, maximum: MAX_INT, description: 'Full amount paid at each due date, in the smallest unit of the user primary currency' })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    totalAmount?: number;

    @ApiPropertyOptional({ example: 12, minimum: MIN_FREQUENCY_MONTHS, maximum: MAX_FREQUENCY_MONTHS })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @Min(MIN_FREQUENCY_MONTHS)
    @Max(MAX_FREQUENCY_MONTHS)
    frequencyMonths?: number;

    @ApiPropertyOptional({ example: '2027-04-15', format: 'date', description: 'Send a new date to postpone the due date' })
    @ValidateIf((_, value) => value !== undefined)
    @IsDateOnly()
    nextDueDate?: string;

    @ApiPropertyOptional({ example: '2026-11-01', format: 'date' })
    @ValidateIf((_, value) => value !== undefined)
    @IsDateOnly()
    startedAt?: string;

    @ApiPropertyOptional({ enum: ProvisionStatus, description: 'cancelled is final: a cancelled provision cannot be changed nor settled anymore' })
    @ValidateIf((_, value) => value !== undefined)
    @IsEnum(ProvisionStatus)
    status?: ProvisionStatus;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Account of the connected user paying the provision, null to unlink it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    accountId?: string | null;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Category of the connected user, null to unlink it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    categoryId?: string | null;
}
