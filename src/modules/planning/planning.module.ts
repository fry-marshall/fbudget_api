import { Module } from "@nestjs/common";
import { PlanningCron } from "./planning.cron";
import { PlanningService } from "./planning.service";

@Module({
    providers: [PlanningService, PlanningCron],
    exports: [PlanningService],
})
export class PlanningModule {}
