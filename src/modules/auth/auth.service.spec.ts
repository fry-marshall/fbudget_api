import { Test } from "@nestjs/testing"
import { AuthService } from "./auth.service"
import { JwtService } from "@nestjs/jwt"
import { GoogleService } from "src/common/services/google.service"
import { ConfigService } from "@nestjs/config"
import { getRepositoryToken } from "@nestjs/typeorm"
import { User } from "../users/user.entity"
import { BadRequestException } from "@nestjs/common"
import { MailService } from "src/common/services/mail.service"


const googleServiceMocked = {
    verifyIdToken: jest.fn()
}
const userRepositoryMocked = {
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
}

let jwtServiceMocked = {
    sign: jest.fn()
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token')
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
                    useValue: {
                        sendMail: jest.fn().mockResolvedValue('')
                    }
                },
                {
                    provide: getRepositoryToken(User),
                    useValue: userRepositoryMocked
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
})