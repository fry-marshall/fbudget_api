import { Controller } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AccountService } from "./account.service";

@ApiTags('accounts')
@Controller('accounts')
export class AccountController {

    constructor(
        private accountService: AccountService,
    ) { }
}
