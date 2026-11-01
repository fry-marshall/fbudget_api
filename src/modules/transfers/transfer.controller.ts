import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { TransferService } from "./transfer.service";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { TransferResponseDto } from "./dto/transfer-response.dto";

@ApiTags('transfers')
@ApiAuthResponses()
@UseGuards(JwtGuard)
@Controller('transfers')
export class TransferController {

    constructor(
        private transferService: TransferService,
    ) { }

    @Post()
    @ApiOperation({ summary: 'Move money between two accounts of the connected user: a negative transaction on the source account and a positive one on the destination account, sharing a transferId. Delete one of them with DELETE /transactions/:id to cancel the transfer' })
    @ApiSuccessResponse(TransferResponseDto, 201)
    @ApiBadRequestResponse({ description: `${ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST} | ${ERRORS_MESSAGES.TRANSFERS.SAME_ACCOUNT}`, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.AUTH.USER_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND}`, type: ErrorResponse })
    create(@CurrentUser() user: PayloadJwt, @Body() createTransferDto: CreateTransferDto): Promise<TransferResponseDto> {
        return this.transferService.create(user.id!, createTransferDto)
    }
}
