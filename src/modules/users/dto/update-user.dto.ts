import { IsNotEmpty, IsString, ValidateIf } from "class-validator";

// ValidateIf instead of IsOptional so that null is rejected, only undefined skips validation
export class UpdateUserDto {
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    displayName?: string;

    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    city?: string;

    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    country?: string;
}
