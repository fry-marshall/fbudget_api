import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Provision } from "./provision.entity";
import { Transaction } from "../transactions/transaction.entity";
import { ProvisionController } from "./provision.controller";
import { ProvisionService } from "./provision.service";

@Module({
    controllers: [ProvisionController],
    providers: [ProvisionService],
    imports: [TypeOrmModule.forFeature([Provision, Transaction])]
})
export class ProvisionModule {}
