import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { IsDateOnly } from "src/common/decorators/is-date-only.decorator";

export class CreateSavingsGoalDto {
    @ApiProperty({ example: 'Apport voiture' })
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiProperty({ example: 20000, minimum: 1, maximum: MAX_INT, description: 'Amount put aside each month before the free budget, in the smallest unit of the user primary currency' })
    @IsDefined()
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    monthlyContribution?: number;

    @ApiPropertyOptional({ example: 300000, minimum: 1, maximum: MAX_INT, nullable: true, description: 'Amount to reach, null for a plain recurring transfer without target' })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    targetAmount?: number | null;

    @ApiPropertyOptional({ example: '2027-10-01', format: 'date', nullable: true, description: 'Day the target should be reached, requires a targetAmount' })
    @IsOptional()
    @IsDateOnly()
    targetDate?: string | null;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Account of the connected user debited by default for the contributions' })
    @IsOptional()
    @IsUUID()
    accountId?: string | null;
}
