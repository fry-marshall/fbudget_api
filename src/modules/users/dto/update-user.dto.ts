import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString, ValidateIf } from "class-validator";

// ValidateIf instead of IsOptional so that null is rejected, only undefined skips validation
export class UpdateUserDto {
    @ApiPropertyOptional({ example: 'John' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    displayName?: string;

    @ApiPropertyOptional({ example: 'Paris' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    city?: string;

    @ApiPropertyOptional({ example: 'France' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    country?: string;
}
