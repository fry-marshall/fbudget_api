import { ApiProperty } from "@nestjs/swagger";
import { IsDefined, IsEnum } from "class-validator";
import { Currency } from "../types";

export class UpdateSettingsDto {
    @ApiProperty({ enum: Currency, description: 'Set once, sending another currency afterwards returns 400' })
    @IsDefined()
    @IsEnum(Currency)
    primaryCurrency?: Currency;
}
