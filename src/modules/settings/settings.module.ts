import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Settings } from "./settings.entity";
import { SettingsService } from "./settings.service";

@Module({
    providers: [SettingsService],
    imports: [TypeOrmModule.forFeature([Settings])],
    exports: [SettingsService]
})
export class SettingsModule {}