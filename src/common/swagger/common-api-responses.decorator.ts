import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { ErrorResponse } from "./api-responses";

/**
 * Document the bearer auth and the 401 response of a JwtGuard protected endpoint
 */
export const ApiAuthResponses = () =>
    applyDecorators(
        ApiBearerAuth(),
        ApiUnauthorizedResponse({ description: 'Missing or invalid token', type: ErrorResponse }),
    );
