import request from 'supertest';
import { INestApplication } from "@nestjs/common"
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { GoogleService } from "src/common/services/google.service";
import { AuthService } from "src/modules/auth/auth.service";
import { User } from "../../src/modules/users/user.entity";
import { Repository } from "typeorm";
import { DataSource } from "typeorm/browser";
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';

const userMockingRepository = {
    findOne: jest.fn().mockResolvedValue({
        id: 'toto',
        email: 'test@gmail.com'
    })
}

const googleServiceMocking = {
    verifyIdToken: jest.fn().mockResolvedValue({
        id: 'toto',
        payload: {
            iat: 1,
            iss: 'test',
            sub: 'test',
            aud: 'test',
            exp: 200000
        }
    })
}

const jwtServiceMocking = {
    sign: jest.fn().mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token')
}


describe("POST auth/google", () => {
    let app: INestApplication;
    let googleService: GoogleService;
    let jwtService: JwtService;
    let configService: ConfigService;
    let userRepository: Repository<User>;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                {
                    provide: getRepositoryToken(User),
                    useValue: userMockingRepository
                },
                {
                    provide: GoogleService,
                    useValue: googleServiceMocking
                }
            ],
            imports: [
                //TypeOrmModule.forRoot()
            ]
        }).compile()

        app = moduleRef.createNestApplication();

        //googleService = moduleRef.get(GoogleService);
        //jwtService = moduleRef.get(JwtService);
        //configService = moduleRef.get(ConfigService);

        await app.init();
    })

    describe('Success cases', () => {

        beforeEach(() => {

            /* jest.spyOn(googleService, 'verifyIdToken').mockResolvedValue({
                id: 'toto',
                payload: {
                    iat: 1,
                    iss: 'test',
                    sub: 'test',
                    aud: 'test',
                    exp: 200000
                }
            }) */
        })

        it('should return an access token and refresh token when user exists', async () => {

            const response = await request(app.getHttpServer())
                .post('auth/google')
                .send({ idToken: 'id-token' })

            expect(response.status).toBe(201)
            expect(response.body.accessToken).toBe('access-token')
            expect(response.body.refreshToken).toBe('refresh-token')
        })

    })


    afterAll(async () => {
        await app.close()
    })
})