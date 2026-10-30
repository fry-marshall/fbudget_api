import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { UuidParamPipe } from "src/common/pipes/uuid-param.pipe";
import { MessageResponseDto } from "src/common/dto/message-response.dto";
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessArrayResponse, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { FixedChargeService } from "./fixed-charge.service";
import { FixedChargeResponseDto } from "./dto/fixed-charge-response.dto";
import { CreateFixedChargeDto } from "./dto/create-fixed-charge.dto";
import { UpdateFixedChargeDto } from "./dto/update-fixed-charge.dto";

@ApiTags('fixed-charges')
@ApiAuthResponses()
@UseGuards(JwtGuard)
@Controller('fixed-charges')
export class FixedChargeController {

    constructor(
        private fixedChargeService: FixedChargeService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'List the connected user fixed charges, oldest first' })
    @ApiSuccessArrayResponse(FixedChargeResponseDto)
    findAll(@CurrentUser() user: PayloadJwt): Promise<FixedChargeResponseDto[]> {
        return this.fixedChargeService.findAll(user.id!)
    }

    @Post()
    @ApiOperation({ summary: 'Create a fixed charge, optionally linked to an account and a category of the connected user' })
    @ApiSuccessResponse(FixedChargeResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.AUTH.USER_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND} | ${ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND}`, type: ErrorResponse })
    create(@CurrentUser() user: PayloadJwt, @Body() createFixedChargeDto: CreateFixedChargeDto): Promise<FixedChargeResponseDto> {
        return this.fixedChargeService.create(user.id!, createFixedChargeDto)
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a fixed charge of the connected user' })
    @ApiSuccessResponse(FixedChargeResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: `${ERRORS_MESSAGES.FIXED_CHARGES.FIXED_CHARGE_NOT_FOUND} | ${ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND} | ${ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND}`, type: ErrorResponse })
    update(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() updateFixedChargeDto: UpdateFixedChargeDto): Promise<FixedChargeResponseDto> {
        return this.fixedChargeService.update(user.id!, id, updateFixedChargeDto)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a fixed charge of the connected user' })
    @ApiSuccessResponse(MessageResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.FIXED_CHARGES.FIXED_CHARGE_NOT_FOUND, type: ErrorResponse })
    remove(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<MessageResponseDto> {
        return this.fixedChargeService.remove(user.id!, id)
    }
}
