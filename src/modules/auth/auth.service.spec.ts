import { Test } from "@nestjs/testing"
import { AuthService } from "./auth.service"
import { JwtService } from "@nestjs/jwt"
import { GoogleService } from "src/common/services/google.service"
import { ConfigService } from "@nestjs/config"
import { getRepositoryToken } from "@nestjs/typeorm"
import { User } from "../users/user.entity"
import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common"
import { MailService } from "src/common/services/mail.service"
import { RefreshTokenService } from "../refresh-tokens/refresh-token.service"


const googleServiceMocked = {
    verifyIdToken: jest.fn()
}
const userRepositoryMocked = {
    findOne: jest.fn().mockResolvedValue({
        id: 'toto',
        email: 'test@gmail.com',
        code: '123456',
        otpExpiredAt: new Date(Date.now() + 900000)
    }),
    update: jest.fn(),
    save: jest.fn(),
}

let jwtServiceMocked = {
    sign: jest.fn()
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token'),
    verifyAsync: jest.fn().mockResolvedValue({
        id: 'toto',
        email: 'test@gmail.com'
    })
}

let mailServiceMocked = {
    sendMail: jest.fn()
}

let refreshTokenServiceMocked = {
    findUserRefreshToken: jest.fn().mockResolvedValue({ id: 'refresh-token', token: 'refresh-token', user: { id: 'toto' } }),
    removeRefreshToken: jest.fn().mockResolvedValue({}),
    saveRefreshToken: jest.fn().mockResolvedValue({}),
}

describe('AuthService', () => {
    let authService: AuthService

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: JwtService,
                    useValue: jwtServiceMocked
                },
                {
                    provide: GoogleService,
                    useValue: googleServiceMocked
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockReturnValue('ACCESS_TOKEN_SECRET')
                    }
                },
                {
                    provide: MailService,
                    useValue: mailServiceMocked
                },
                {
                    provide: getRepositoryToken(User),
                    useValue: userRepositoryMocked
                },
                {
                    provide: RefreshTokenService,
                    useValue: refreshTokenServiceMocked

                },
            ]
        }).compile()

        authService = moduleRef.get(AuthService)
    })

    beforeEach(() => {
        jwtServiceMocked.sign = jest.fn()
            .mockReturnValueOnce('access-token')
            .mockReturnValueOnce('refresh-token')
    })

    describe('googleAuthentication', () => {
        describe('success cases', () => {
            it('should return credentials when user already exists', async () => {
                googleServiceMocked.verifyIdToken = jest.fn().mockResolvedValue({
                    id: 'id',
                    payload: {
                        iat: 1,
                        iss: 'iss',
                        sub: 'sub',
                        aud: 'aud',
                        exp: 200000
                    }
                })

                userRepositoryMocked.findOne = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com'
                })

                const tokens = await authService.googleAuthentication('idToken')

                expect(tokens).toStrictEqual({
                    accessToken: 'access-token',
                    refreshToken: 'refresh-token',
                })
            });

            it('should return credentials when user not exists', async () => {
                googleServiceMocked.verifyIdToken = jest.fn().mockResolvedValue({
                    id: 'id',
                    payload: {
                        iat: 1,
                        iss: 'iss',
                        sub: 'sub',
                        aud: 'aud',
                        exp: 200000
                    }
                })

                userRepositoryMocked.findOne = jest.fn().mockResolvedValue(null)

                userRepositoryMocked.save = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com'
                })

                const tokens = await authService.googleAuthentication('idToken')

                expect(tokens).toStrictEqual({
                    accessToken: 'access-token',
                    refreshToken: 'refresh-token',
                })
            })
        })

        describe('failure cases', () => {
            it('should throw BadRequestException when google idToken is null', async () => {
                googleServiceMocked.verifyIdToken = jest.fn().mockRejectedValue(new BadRequestException('Id token is null or not a string'))

                userRepositoryMocked.save = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com'
                })

                await expect(authService.googleAuthentication('idToken')).rejects.toThrow(new BadRequestException('Id token is null or not a string'))
            })
        })
    })

    describe('emailAuthentication', () => {
        describe('success cases', () => {
            it('should return otp by email when user already exists', async () => {
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com'
                })

                const response = await authService.emailAuthentication('toto@gmail.com')
                expect(response.message).toBe('OTP send successfully')
            });

            it('should return otp when user not exists', async () => {

                userRepositoryMocked.findOne = jest.fn().mockResolvedValue(null)

                userRepositoryMocked.save = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com'
                })

                const response = await authService.emailAuthentication('toto@gmail.com')
                expect(response.message).toBe('OTP send successfully')
            })
        })

        describe('failure cases', () => {
            it('should throw exception repository method fails', async () => {
                userRepositoryMocked.findOne = jest.fn().mockRejectedValue(new BadRequestException('An error occured'))

                await expect(authService.emailAuthentication('toto@gmail.com')).rejects.toThrow(new BadRequestException('An error occured'))
            })
        })
    })

    describe('requestOtp', () => {
        describe('success cases', () => {
            it('should return otp by email when user exists', async () => {
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com'
                })

                const response = await authService.emailAuthentication('toto@gmail.com')
                expect(response.message).toBe('OTP send successfully')
            });
        })

        describe('failure cases', () => {
            it('should throw exception when user doesn\'t exist', async () => {
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue(null)

                await expect(authService.requestOtp('toto@gmail.com')).rejects.toThrow(new NotFoundException('User not found'))
            })

            it('should throw exception when email service fails', async () => {
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com'
                })

                mailServiceMocked.sendMail = jest.fn().mockRejectedValue(new Error('Email cannot be sent'))

                await expect(authService.requestOtp('toto@gmail.com')).rejects.toThrow(new Error('Email cannot be sent'))
            })

            it('should throw exception repository method fails', async () => {
                userRepositoryMocked.findOne = jest.fn().mockRejectedValue(new BadRequestException('An error occured'))

                await expect(authService.requestOtp('toto@gmail.com')).rejects.toThrow(new BadRequestException('An error occured'))
            })
        })
    })

    describe('verifyOtp', () => {
        describe('success cases', () => {
            it('should return credentials when user exists, code is valid & expired time not reached yet', async () => {
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com',
                    code: '123456',
                    otpExpiredAt: new Date(Date.now() + 900000)
                })

                const response = await authService.verifyOtp('test@gmail.com', '123456')
                expect(response.accessToken).toBe('access-token')
                expect(response.refreshToken).toBe('refresh-token')
            });
        })

        describe('failure cases', () => {
            it('should throw not found exception when user doesn\'t exist or code is incorrect', async () => {
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue(null)

                await expect(authService.requestOtp('toto@gmail.com')).rejects.toThrow(new NotFoundException('User not found'))
            })

            it('should throw unauthorized exception when otp time is expired', async () => {
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com',
                    otpCode: '123456',
                    otpExpiresAt: new Date(Date.now() - 10000)
                })

                await expect(authService.verifyOtp('toto@gmail.com', '123456')).rejects.toThrow(new UnauthorizedException('Otp code is incorrect'))
            })

            it('should throw exception repository method fails', async () => {
                userRepositoryMocked.findOne = jest.fn().mockRejectedValue(new BadRequestException('An error occured'))

                await expect(authService.verifyOtp('toto@gmail.com', '123456')).rejects.toThrow(new BadRequestException('An error occured'))
            })
        })
    })

    describe('refresh token', () => {
        describe('success cases', () => {
            it('should return credentials when user exists, refresh token is valid & existed in database', async () => {

                userRepositoryMocked.findOne = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com',
                    code: '123456',
                    otpExpiredAt: new Date(Date.now() + 900000)
                });

                const response = await authService.refreshToken('123456')
                expect(response.accessToken).toBe('access-token')
                expect(response.refreshToken).toBe('refresh-token')
                expect(jwtServiceMocked.verifyAsync).toHaveBeenCalled()
                expect(refreshTokenServiceMocked.findUserRefreshToken).toHaveBeenCalledWith('toto', '123456')
                expect(refreshTokenServiceMocked.saveRefreshToken).toHaveBeenCalledWith('toto', 'refresh-token')
                expect(refreshTokenServiceMocked.removeRefreshToken).toHaveBeenCalledWith('123456')

            });
        })

        describe('failure cases', () => {
            it('should throw not found exception when user doesn\'t exist', async () => {
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue(null)

                await expect(authService.refreshToken('123456')).rejects.toThrow(new NotFoundException('User not found'))
            })

            it('should throw unauthorized exception when refresh token is invalid or expired', async () => {
                jwtServiceMocked.verifyAsync = jest.fn().mockResolvedValue(null)

                await expect(authService.refreshToken('123456')).rejects.toThrow(new UnauthorizedException('Refresh token is not valid'))
            })

            it('should throw unauthorized exception when refresh token doesn\'t exist', async () => {
                jwtServiceMocked.verifyAsync = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com'
                })
                refreshTokenServiceMocked.findUserRefreshToken = jest.fn().mockResolvedValue(null)
                userRepositoryMocked.findOne = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com',
                    otpCode: '123456',
                    otpExpiresAt: new Date(Date.now() - 10000)
                })

                await expect(authService.refreshToken('123456')).rejects.toThrow(new UnauthorizedException('Refresh token not found'))
            })

            it('should throw exception repository method fails', async () => {
                jwtServiceMocked.verifyAsync = jest.fn().mockResolvedValue({
                    id: 'toto',
                    email: 'test@gmail.com'
                })
                userRepositoryMocked.findOne = jest.fn().mockRejectedValue(new BadRequestException('An error occured'))

                await expect(authService.refreshToken('123456')).rejects.toThrow(new BadRequestException('An error occured'))
            })
        })
    })
})