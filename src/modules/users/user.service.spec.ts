import { Test } from "@nestjs/testing";
import { UserService } from "./user.service";
import { getRepositoryToken } from "@nestjs/typeorm";
import { User } from "./user.entity";
import { AuthProvider, SubscriptionPlan, UserRole } from "./types";
import { Currency } from "../settings/types";
import { NotFoundException } from "@nestjs/common";
import { ERRORS_MESSAGES } from "src/common/constants";

describe('UserService', () => {

    let userRepositoryMocked = {
        findOne: jest.fn(),
        update: jest.fn(),
    };
    let userService: UserService;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                UserService,
                { provide: getRepositoryToken(User), useValue: userRepositoryMocked },
            ]
        }).compile()

        userService = moduleRef.get(UserService)
    })

    describe('getMe', () => {
        describe('Success cases', () => {
            it('should return user with correct informations', async () => {

                const user: User = {
                    id: 'user-id',
                    email: 'test@gmail.com',
                    authProviders: [AuthProvider.EMAIL],
                    displayName: 'displayName',
                    city: 'city',
                    country: 'country',
                    plan: SubscriptionPlan.FREE,
                    role: UserRole.USER,
                    settings: {
                        id: 'settings-id',
                        primaryCurrency: Currency.EUR,
                        monthlyBudget: 200,
                    },
                    createdAt: new Date(),
                }

                userRepositoryMocked.findOne = jest.fn().mockResolvedValue(user)

                const response = await userService.getMe('user-id');

                const expectedUser = {
                    id: user.id,
                    email: user.email,
                    displayName: user.displayName,
                    city: user.city,
                    country: user.country,
                    plan: user.plan,
                    role: user.role,
                    settings: user.settings,
                    createdAt: user.createdAt
                }
                expect(response).toStrictEqual(expectedUser)
            })
        });

        describe('Failure cases', () => {
            it('should throw NotFoundException when user is not existed', async () => {
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue(null)
                await expect(userService.getMe('user-id')).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND))
            })

            it('should throw Exception when findOne throw error', async () => {
                userRepositoryMocked.findOne = jest.fn().mockRejectedValue(new Error('An error has occured'))
                await expect(userService.getMe('user-id')).rejects.toThrow(new Error('An error has occured'))
            })
        });

    })

    describe('updateMe', () => {
        describe('Success cases', () => {
            it('should update user & return it with its correct informations', async () => {
                const user: User = {
                    id: 'user-id',
                    email: 'test@gmail.com',
                    authProviders: [AuthProvider.EMAIL],
                    displayName: 'displayName',
                    city: 'city',
                    country: 'country',
                    plan: SubscriptionPlan.FREE,
                    role: UserRole.USER,
                    settings: {
                        id: 'settings-id',
                        primaryCurrency: Currency.EUR,
                        monthlyBudget: 200,
                    },
                    createdAt: new Date(),
                }

                userRepositoryMocked.findOne = jest.fn().mockResolvedValue(user)
                userRepositoryMocked.update = jest.fn().mockResolvedValue(null)

                const response = await userService.updateMe('user-id', { displayName: 'toto' });

                const expectedUser = {
                    id: user.id,
                    email: user.email,
                    displayName: 'toto',
                    city: user.city,
                    country: user.country,
                    plan: user.plan,
                    role: user.role,
                    settings: user.settings,
                    createdAt: user.createdAt
                }
                expect(response).toStrictEqual(expectedUser)
            })
        });

        describe('Failure cases', () => {
            it('should throw NotFoundException when user is not existed', async () => {
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue(null)
                await expect(userService.updateMe('user-id', { displayName: 'toto' })).rejects.toThrow(new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND))
            })

            it('should throw Exception when findOne throw error', async () => {
                userRepositoryMocked.findOne = jest.fn().mockRejectedValue(new Error('An error has occured'))
                await expect(userService.getMe('user-id')).rejects.toThrow(new Error('An error has occured'))
            })

            it('should throw Exception when update throw error', async () => {
                const user: User = {
                    id: 'user-id',
                    email: 'test@gmail.com',
                    authProviders: [AuthProvider.EMAIL],
                    displayName: 'displayName',
                    city: 'city',
                    country: 'country',
                    plan: SubscriptionPlan.FREE,
                    role: UserRole.USER,
                    settings: {
                        id: 'settings-id',
                        primaryCurrency: Currency.EUR,
                        monthlyBudget: 200,
                    },
                    createdAt: new Date(),
                }

                userRepositoryMocked.findOne = jest.fn().mockResolvedValue(user)
                userRepositoryMocked.update = jest.fn().mockRejectedValue(new Error('An error has occured'))
                await expect(userService.updateMe('user-id', { displayName: 'toto' })).rejects.toThrow(new Error('An error has occured'))
            })
        });

    })
})