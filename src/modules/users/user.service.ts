import { Injectable, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { User } from "./user.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { ERRORS_MESSAGES } from "src/common/constants";
import { UserResponseDto } from "./dto/user-response.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateSettingsDto } from "../settings/dto/update-settings.dto";
import { SettingsResponseDto } from "../settings/dto/settings-response.dto";
import { SettingsService } from "../settings/settings.service";
import { RefreshTokenService } from "../refresh-tokens/refresh-token.service";

@Injectable()
export class UserService {

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private settingsService: SettingsService,
        private refreshTokenService: RefreshTokenService
    ) { }

    async getMe(userId: string): Promise<UserResponseDto> {
        const user = await this.userRepository.findOne({
            select: {
                id: true,
                displayName: true,
                email: true,
                city: true,
                country: true,
                plan: true,
                role: true,
                settings: {
                    id: true,
                    primaryCurrency: true,
                    monthlyBudget: true,
                },
                createdAt: true
            },
            relations: {
                settings: true
            },
            where: {
                id: userId
            },
        })

        if (!user) {
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND);
        }

        return this.toDto(user);
    }

    async updateMe(userId: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {

        const user = await this.userRepository.findOne({
            where: {
                id: userId
            },
        })

        if (!user) {
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND);
        }

        await this.userRepository.update(user.id!, {
            ...updateUserDto
        })

        return this.getMe(user.id!);
    }

    async deleteMe(userId: string): Promise<{ message: string }> {

        const user = await this.userRepository.findOne({
            where: {
                id: userId
            },
        })

        if (!user) {
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND);
        }

        await this.refreshTokenService.removeUserRefreshTokens(user.id!)
        await this.userRepository.softDelete(user.id!)

        return { message: ERRORS_MESSAGES.USER.USER_DELETED }
    }

    async updateSettings(userId: string, updateSettingsDto: UpdateSettingsDto): Promise<SettingsResponseDto> {
        const user = await this.userRepository.findOne({
            select: {
                settings: {
                    id: true,
                    primaryCurrency: true,
                    monthlyBudget: true,
                }
            },
            where: { id: userId }
        },)

        if (!user) {
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        }

        if (!user.settings) {
            throw new NotFoundException(ERRORS_MESSAGES.SETTINGS.SETTINGS_NOT_FOUND)
        }

        return this.settingsService.updateSettings(user.settings.id!, updateSettingsDto)
    }

    private toDto(user: User): UserResponseDto {
        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            city: user.city,
            country: user.country,
            plan: user.plan,
            role: user.role,
            settings: {
                id: user.settings?.id,
                primaryCurrency: user.settings?.primaryCurrency,
                monthlyBudget: user.settings?.monthlyBudget,
            },
            createdAt: user.createdAt
        }
    }
}