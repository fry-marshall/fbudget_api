import { Body, Controller, Delete, Get, Put, Request, UseGuards } from "@nestjs/common";
import { JwtGuard } from "src/common/guards/jwt.guard";
import { UserService } from "./user.service";
import { UserResponseDto } from "./dto/user-response.dto";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { UpdateUserDto } from "./dto/update-user.dto";
import type { PayloadJwt } from "src/common/interfaces";

@Controller('users')
export class UserController {

    constructor(
        private userService: UserService
    ) { }

    @Get('me')
    @UseGuards(JwtGuard)
    getMe(@CurrentUser() user: PayloadJwt): Promise<UserResponseDto> {
        return this.userService.getMe(user.id!);
    }

    @Put('me')
    @UseGuards(JwtGuard)
    updateMe(@CurrentUser() user: PayloadJwt, @Body() updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
        return this.userService.updateMe(user.id!, updateUserDto)
    }

    @Delete('me')
    @UseGuards(JwtGuard)
    deleteMe(@CurrentUser() user: PayloadJwt): Promise<UserResponseDto> {
        return this.userService.deleteMe(user.id!)
    }
}