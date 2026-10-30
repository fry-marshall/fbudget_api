import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Account } from "./account.entity";
import { Transaction } from "../transactions/transaction.entity";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";

@Module({
    controllers: [AccountController],
    providers: [AccountService],
    imports: [TypeOrmModule.forFeature([Account, Transaction])]
})
export class AccountModule {}
