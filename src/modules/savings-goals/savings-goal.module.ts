import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SavingsGoal } from "./savings-goal.entity";
import { Transaction } from "../transactions/transaction.entity";
import { SavingsGoalController } from "./savings-goal.controller";
import { SavingsGoalService } from "./savings-goal.service";

@Module({
    controllers: [SavingsGoalController],
    providers: [SavingsGoalService],
    imports: [TypeOrmModule.forFeature([SavingsGoal, Transaction])]
})
export class SavingsGoalModule {}
