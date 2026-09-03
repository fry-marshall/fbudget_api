import { IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    displayName?: string

    @IsOptional()
    @IsString()
    city?: string

    @IsOptional()
    @IsString()
    country?: string
}