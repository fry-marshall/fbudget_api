import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { MAX_INT } from "src/common/constants";

export class CreateIncomeDto {
    @ApiProperty({ example: 'Salaire' })
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiProperty({ example: 248000, minimum: 1, maximum: MAX_INT, description: 'Monthly amount in the smallest unit of the user primary currency, an estimate when isVariable is true' })
    @IsDefined()
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    amount?: number;

    @ApiPropertyOptional({ example: 28, minimum: 1, maximum: 31, nullable: true, description: 'Day the income is received, moved to the last day of the month when the month is shorter' })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(31)
    dayOfMonth?: number | null;

    @ApiPropertyOptional({ default: false })
    @IsOptional()
    @IsBoolean()
    isVariable?: boolean;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Account of the connected user receiving the income' })
    @IsOptional()
    @IsUUID()
    accountId?: string | null;
}
