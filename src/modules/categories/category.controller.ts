import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { UuidParamPipe } from "src/common/pipes/uuid-param.pipe";
import { MessageResponseDto } from "src/common/dto/message-response.dto";
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import type { PayloadJwt } from "src/common/interfaces";
import { ApiAuthResponses, ApiSuccessArrayResponse, ApiSuccessResponse, ErrorResponse } from "src/common/swagger";
import { ERRORS_MESSAGES } from "src/common/constants";
import { CategoryService } from "./category.service";
import { CategoryResponseDto } from "./dto/category-response.dto";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@ApiTags('categories')
@ApiAuthResponses()
@UseGuards(JwtGuard)
@Controller('categories')
export class CategoryController {

    constructor(
        private categoryService: CategoryService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'List the connected user categories, oldest first' })
    @ApiSuccessArrayResponse(CategoryResponseDto)
    findAll(@CurrentUser() user: PayloadJwt): Promise<CategoryResponseDto[]> {
        return this.categoryService.findAll(user.id!)
    }

    @Post()
    @ApiOperation({ summary: 'Create a category, only one category per standard type, several of type other' })
    @ApiSuccessResponse(CategoryResponseDto, 201)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.AUTH.USER_NOT_FOUND, type: ErrorResponse })
    @ApiConflictResponse({ description: ERRORS_MESSAGES.CATEGORIES.CATEGORY_ALREADY_EXISTS, type: ErrorResponse })
    create(@CurrentUser() user: PayloadJwt, @Body() createCategoryDto: CreateCategoryDto): Promise<CategoryResponseDto> {
        return this.categoryService.create(user.id!, createCategoryDto)
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update the label or the envelope budget of a category, the type cannot be changed' })
    @ApiSuccessResponse(CategoryResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND, type: ErrorResponse })
    update(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string, @Body() updateCategoryDto: UpdateCategoryDto): Promise<CategoryResponseDto> {
        return this.categoryService.update(user.id!, id, updateCategoryDto)
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a category of the connected user' })
    @ApiSuccessResponse(MessageResponseDto)
    @ApiBadRequestResponse({ description: ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST, type: ErrorResponse })
    @ApiNotFoundResponse({ description: ERRORS_MESSAGES.CATEGORIES.CATEGORY_NOT_FOUND, type: ErrorResponse })
    remove(@CurrentUser() user: PayloadJwt, @Param('id', UuidParamPipe) id: string): Promise<MessageResponseDto> {
        return this.categoryService.remove(user.id!, id)
    }
}
