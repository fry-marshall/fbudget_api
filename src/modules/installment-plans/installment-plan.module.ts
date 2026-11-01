import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InstallmentPlan } from "./installment-plan.entity";
import { Installment } from "./installment.entity";
import { Transaction } from "../transactions/transaction.entity";
import { InstallmentPlanController } from "./installment-plan.controller";
import { InstallmentPlanService } from "./installment-plan.service";

@Module({
    controllers: [InstallmentPlanController],
    providers: [InstallmentPlanService],
    imports: [TypeOrmModule.forFeature([InstallmentPlan, Installment, Transaction])]
})
export class InstallmentPlanModule {}
