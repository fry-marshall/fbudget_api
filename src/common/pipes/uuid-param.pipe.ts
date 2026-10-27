import { BadRequestException, ParseUUIDPipe } from "@nestjs/common";
import { ERRORS_MESSAGES } from "../constants";

export const UuidParamPipe = new ParseUUIDPipe({
    exceptionFactory: () => new BadRequestException(ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST),
})
