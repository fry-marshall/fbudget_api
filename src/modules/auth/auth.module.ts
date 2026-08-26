import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { GooglePassportStrategy } from "src/common/strategies/google.strategy";
import { GoogleService } from "src/common/services/google.service";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/user.entity";
import { MailService } from "src/common/services/mail.service";

@Module({
    imports: [JwtModule.register({}), TypeOrmModule.forFeature([User])],
    controllers: [AuthController, MailService],
    providers: [AuthService, /* GooglePassportStrategy ,*/ GoogleService]
})
export class AuthModule { }