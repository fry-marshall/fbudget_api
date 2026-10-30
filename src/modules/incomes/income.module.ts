import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Income } from "./income.entity";
import { IncomeController } from "./income.controller";
import { IncomeService } from "./income.service";

@Module({
    controllers: [IncomeController],
    providers: [IncomeService],
    imports: [TypeOrmModule.forFeature([Income])]
})
export class IncomeModule {}
