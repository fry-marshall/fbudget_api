import { Settings } from "src/modules/settings/settings.entity";
import { SubscriptionPlan, UserRole } from "../types";
import { SettingsResponseDto } from "src/modules/settings/dto/settings-response.dto";

export class UserResponseDto {
    id?: string;
    email?: string;
    displayName?: string;
    city?: string;
    country?: string;
    plan?: SubscriptionPlan;
    role?: UserRole;
    settings?: SettingsResponseDto | null;
    createdAt?: Date;
}