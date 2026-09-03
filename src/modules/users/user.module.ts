import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./user.entity";
import { UserService } from "./user.service";

@Module({
    controllers: [UserController],
    providers: [UserService],
    imports: [TypeOrmModule.forFeature([User])]
})
export class UserModule{}