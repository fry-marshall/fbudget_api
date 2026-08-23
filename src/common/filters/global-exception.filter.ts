import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { Response } from "express";
import { ERRORS_MESSAGES } from "../constants";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {

    private logger: Logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: Error, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        if(exception instanceof HttpException){
            let message: string;
            const status = exception.getStatus();
            const exceptionMessage = (exception.getResponse() as any).message

            if(exception instanceof BadRequestException && Array.isArray(exceptionMessage)){
                message = ERRORS_MESSAGES.EXCEPTIONS.BAD_REQUEST
                this.logger.error(`${message}: ${exceptionMessage.join(',')}`)
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
        else {
            this.logger.error(`[${exception.name}]: ${exception.stack}`)
            response.status(500).json({
                message: 'An error has occured',
                statusCode: 500
            })
        }

    }
}