import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PlanningService } from "./planning.service";

@Injectable()
export class PlanningCron {

    constructor(
        private planningService: PlanningService
    ) { }

    /**
     * Every day at 00:05 UTC, generate the pending transactions of the month and purge the unpaid ones
     */
    @Cron('5 0 * * *', { name: 'planning-generation', timeZone: 'UTC' })
    async generate(): Promise<void> {
        await this.planningService.generateAll()
    }
}
