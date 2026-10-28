import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsString, Max, Min, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";

export class UpdateCategoryDto {
    @ApiPropertyOptional({ example: 'Netflix' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiPropertyOptional({ example: 14000, minimum: 0, maximum: MAX_INT, description: 'Monthly envelope budget in the smallest unit of the primary currency' })
    @ValidateIf((_, value) => value !== undefined)
    @IsInt()
    @Min(0)
    @Max(MAX_INT)
    envelopeBudget?: number;
}
