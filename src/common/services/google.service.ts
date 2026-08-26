import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import { GoogleToken } from "../interfaces/google-token.interface";

@Injectable()
export class GoogleService {
    private client: OAuth2Client;

    constructor(
        private configService: ConfigService
    ) {
        this.client = new OAuth2Client({
            client_id: configService.get('GOOGLE_CLIENT_ID') ?? ''
        })
    }

    async verifyIdToken(idToken: string): Promise<GoogleToken> {
        if (!idToken || typeof idToken !== 'string') {
            throw new BadRequestException('Id token is null or not a string')
        }
        try {
            const infos = await this.client.verifyIdToken({
                idToken: idToken,
                audience: this.configService.get('GOOGLE_CLIENT_ID') ?? ''
            })
            return {
                id: infos.getUserId(),
                payload: infos.getPayload(),
            };
        }
        catch (err) {
            throw new BadRequestException(err)
        }
    }
}