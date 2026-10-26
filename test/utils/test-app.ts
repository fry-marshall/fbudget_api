import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "src/app.module";
import { setupApp } from "src/setup-app";
import { DataSource, EntityTarget, ObjectLiteral, Repository } from "typeorm";

export type ProviderOverride = {
    provider: any,
    useValue: unknown
}

export type TestContext = {
    app: INestApplication,
    moduleRef: TestingModule,
    dataSource: DataSource,
    jwtService: JwtService,
    configService: ConfigService,
    repo: <T extends ObjectLiteral>(entity: EntityTarget<T>) => Repository<T>
}

/**
 * Compile AppModule with optional provider overrides and init the app configured the same way as main.ts
 */
export const createTestApp = async (overrides: ProviderOverride[] = []): Promise<TestContext> => {
    const builder = Test.createTestingModule({
        imports: [AppModule]
    })
    overrides.forEach(({ provider, useValue }) => builder.overrideProvider(provider).useValue(useValue))

    const moduleRef = await builder.compile()
    const app = moduleRef.createNestApplication()
    setupApp(app)
    await app.init()

    const dataSource = moduleRef.get(DataSource)

    return {
        app,
        moduleRef,
        dataSource,
        jwtService: moduleRef.get(JwtService),
        configService: moduleRef.get(ConfigService),
        repo: (entity) => dataSource.getRepository(entity)
    }
}
