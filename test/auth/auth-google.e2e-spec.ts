import { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing";
import { AppModule } from 'src/app.module';

describe("POST auth/google", () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                AppModule
            ]
        }).compile()

        app = moduleRef.createNestApplication();
        await app.init();
    })

    describe('Success cases', () => {

        beforeEach(() => {
        })
    })


    afterAll(async () => {
        await app.close()
    })
})