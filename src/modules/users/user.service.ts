import { Injectable, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { User } from "./user.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { ERRORS_MESSAGES } from "src/common/constants";
import { UserResponseDto } from "./dto/user-response.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UserService {

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>
    ) { }

    async getMe(userId: string): Promise<UserResponseDto> {
        const user = await this.userRepository.findOne({
            select: {
                id: true,
                email: true,
                authProviders: true,
                city: true,
                country: true,
                plan: true,
                role: true,
                settings: {
                    id: true,
                    primaryCurrency: true,
                    monthlyBudget: true,
                },
                createdAt: true
            },
            where: {
                id: userId
            },
        })

        if (!user) {
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND);
        }

        return this.toDto(user);
    }

    async updateMe(userId: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {

        let user = await this.userRepository.findOne({
            where: {
                id: userId
            },
        })

        if (!user) {
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND);
        }

        await this.userRepository.update(user.id!, {
            ...updateUserDto
        })

        user = {
            ...user,
            ...updateUserDto
        }

        return this.toDto(user);
    }

    async deleteMe(userId: string): Promise<{ message: string }> {

        let user = await this.userRepository.findOne({
            where: {
                id: userId
            },
        })

        if (!user) {
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND);
        }

        await this.userRepository.delete(user.id!)

        return { message: ERRORS_MESSAGES.USER.USER_DELETED }
    }

    private toDto(user: User): UserResponseDto {
        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            city: user.city,
            country: user.country,
            plan: user.plan,
            role: user.role,
            settings: user.settings ? {
                id: user.settings?.id,
                primaryCurrency: user.settings?.primaryCurrency,
                monthlyBudget: user.settings?.monthlyBudget,
            } : null,
            createdAt: user.createdAt
        }
    }
}