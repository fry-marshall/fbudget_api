import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { MAX_INT } from "src/common/constants";

export class CreateFixedChargeDto {
    @ApiProperty({ example: 'Loyer' })
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiProperty({ example: 85000, minimum: 1, maximum: MAX_INT, description: 'Monthly amount in the smallest unit of the user primary currency' })
    @IsDefined()
    @IsInt()
    @Min(1)
    @Max(MAX_INT)
    amount?: number;

    @ApiProperty({ example: 5, minimum: 1, maximum: 31, description: 'Day the charge is debited, moved to the last day of the month when the month is shorter' })
    @IsDefined()
    @IsInt()
    @Min(1)
    @Max(31)
    dayOfMonth?: number;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Account of the connected user debited by the charge' })
    @IsOptional()
    @IsUUID()
    accountId?: string | null;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Category of the connected user' })
    @IsOptional()
    @IsUUID()
    categoryId?: string | null;
}
