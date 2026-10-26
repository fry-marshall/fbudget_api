import { ApiProperty } from "@nestjs/swagger";
import { Settings } from "src/modules/settings/settings.entity";
import { SubscriptionPlan, UserRole } from "../types";
import { SettingsResponseDto } from "src/modules/settings/dto/settings-response.dto";

export class UserResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ example: 'john@example.com' })
    email?: string;

    @ApiProperty({ example: 'John', nullable: true })
    displayName?: string;

    @ApiProperty({ example: 'Paris', nullable: true })
    city?: string;

    @ApiProperty({ example: 'France', nullable: true })
    country?: string;

    @ApiProperty({ enum: SubscriptionPlan })
    plan?: SubscriptionPlan;

    @ApiProperty({ enum: UserRole })
    role?: UserRole;

    @ApiProperty({ type: SettingsResponseDto })
    settings?: SettingsResponseDto;

    @ApiProperty()
    createdAt?: Date;
}
