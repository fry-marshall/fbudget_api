import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./user.entity";
import { UserService } from "./user.service";
import { SettingsModule } from "../settings/settings.module";
import { RefreshTokenModule } from "../refresh-tokens/refresh-token.module";

@Module({
    controllers: [UserController],
    providers: [UserService],
    imports: [TypeOrmModule.forFeature([User]), SettingsModule, RefreshTokenModule]
})
export class UserModule{}