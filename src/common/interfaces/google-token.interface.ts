import { TokenPayload } from "google-auth-library";

export interface GoogleToken {
    id?: string | null;
    payload?: TokenPayload | null;
}