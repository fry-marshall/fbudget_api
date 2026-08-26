import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { GoogleCallbackParameters, Strategy, VerifyCallback } from "passport-google-oauth20";

@Injectable()
export class GooglePassportStrategy extends PassportStrategy(Strategy, 'google', 6) {

    constructor(private configService: ConfigService) {
        super({
            clientID: configService.get('GOOGLE_CLIENT_ID') ?? '',
            clientSecret: configService.get('GOOGLE_CLIENT_SECRET') ?? '',
            scope: ['email', 'profile', 'openid'],
            callbackURL: 'http://localhost:3000/auth/google/callback',
            passReqToCallback: true,
        })
    }

    validate(
        req: any,
        accessToken: string,
        refreshToken: string,
        params: GoogleCallbackParameters,
        profile: any,
        done: VerifyCallback
    ): any {
        const { name, emails, photos } = profile;
        const idToken = params.id_token;
        const user = {
            firstName: name.givenName,
            lastName: name.familyName,
            email: emails[0].value,
            accessToken,
            refreshToken,
            idToken
        }
        done(null, user)
    }

}