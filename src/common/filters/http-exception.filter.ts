import { ArgumentsHost, BadGatewayException, BadRequestException, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { Request, Response } from "express";
import { ERRORS_MESSAGES } from "../constants";

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {

    private logger: Logger = new Logger(HttpExceptionFilter.name);

    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const status = exception.getStatus();

        let message: string;
        
        if(exception instanceof BadRequestException && Array.isArray(exception.message)){
            message = ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST
            this.logger.error(`${message}: ${exception.message.join(',')}`)
        }
        else if (status >= 500){
            message = ERRORS_MESSAGES.EXCEPTIONS.INTERNAL_ERROR
            this.logger.error(`${message}: ${exception.message}`);
        }
        else {
            message = exception.message;
            this.logger.error(`[${exception.name}]: ${message}`)
        }

        response.status(status).json({
            message,
            statusCode: status
        })
    }
}