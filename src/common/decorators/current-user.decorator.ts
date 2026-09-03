import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { PayloadJwt } from "../interfaces";

export const CurrentUser = createParamDecorator(
    (date: any, context: ExecutionContext): PayloadJwt => {
        const request = context.switchToHttp().getRequest()
        return request.user
    }
)