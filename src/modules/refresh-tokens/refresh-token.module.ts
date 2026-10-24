import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { RefreshToken } from "./refresh-token.entity";
import { RefreshTokenService } from "./refresh-token.service";

@Module({
    imports: [JwtModule.register({}), TypeOrmModule.forFeature([RefreshToken])],
    providers: [RefreshTokenService],
    exports: [RefreshTokenService]
})
export class RefreshTokenModule {}