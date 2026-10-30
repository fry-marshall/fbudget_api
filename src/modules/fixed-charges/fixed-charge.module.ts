import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FixedCharge } from "./fixed-charge.entity";
import { FixedChargeController } from "./fixed-charge.controller";
import { FixedChargeService } from "./fixed-charge.service";

@Module({
    controllers: [FixedChargeController],
    providers: [FixedChargeService],
    imports: [TypeOrmModule.forFeature([FixedCharge])]
})
export class FixedChargeModule {}
