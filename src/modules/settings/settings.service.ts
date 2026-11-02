import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Settings } from "./settings.entity";
import { Repository } from "typeorm";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { SettingsResponseDto } from "./dto/settings-response.dto";
import { ERRORS_MESSAGES } from "src/common/constants";

@Injectable()
export class SettingsService {

    constructor(
        @InjectRepository(Settings)
        private settingsRepository: Repository<Settings>
    ) { }

    async updateSettings(settingsId: string, updateSettingsDto: UpdateSettingsDto): Promise<SettingsResponseDto> {
        let settings = await this.settingsRepository.findOne({
            where: {
                id: settingsId
            }
        })

        if (!settings) {
            throw new NotFoundException(ERRORS_MESSAGES.SETTINGS.SETTINGS_NOT_FOUND)
        }

        const result = await this.settingsRepository.createQueryBuilder()
            .update(Settings)
            .set({ ...updateSettingsDto })
            .where('id = :id AND ("primaryCurrency" IS NULL OR "primaryCurrency" = :primaryCurrency)', { id: settings.id, primaryCurrency: updateSettingsDto.primaryCurrency })
            .execute()

        if (!result.affected) {
            throw new BadRequestException(ERRORS_MESSAGES.SETTINGS.PRIMARY_CURRENCY_ALREADY_SET)
        }

        settings = {
            ...settings,
            ...updateSettingsDto
        }

        return this.toDto(settings);
    }

    async createSettings(): Promise<Settings> {
        return this.settingsRepository.save({});
    }

    private toDto(settings: Settings): SettingsResponseDto {
        return {
            id: settings.id,
            primaryCurrency: settings.primaryCurrency,
        }
    }
}