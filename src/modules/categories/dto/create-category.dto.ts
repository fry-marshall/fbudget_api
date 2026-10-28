import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDefined, IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, ValidateIf } from "class-validator";
import { MAX_INT } from "src/common/constants";
import { CategoryType } from "../types";

export class CreateCategoryDto {
    @ApiProperty({ enum: CategoryType, description: 'Cannot be changed after creation' })
    @IsDefined()
    @IsEnum(CategoryType)
    type?: CategoryType;

    @ApiPropertyOptional({ example: 'Netflix', description: 'Required when type is other, otherwise the front displays the default label of the type' })
    @ValidateIf((dto: CreateCategoryDto, value) => dto.type === CategoryType.OTHER || value !== undefined)
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
