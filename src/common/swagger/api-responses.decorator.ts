import { applyDecorators } from "@nestjs/common";
import { ApiExtraModels, ApiResponse, getSchemaPath } from "@nestjs/swagger";

/**
 * Document a success response wrapped by the ResponseInterceptor in { statusCode, data }
 */
export const ApiSuccessResponse = <T extends new (...args: any[]) => any>(
    dataType: T,
    statusCode: 200 | 201 = 200,
    description = 'Success',
) =>
    applyDecorators(
        ApiExtraModels(dataType),
        ApiResponse({
            status: statusCode,
            description,
            schema: {
                properties: {
                    statusCode: { type: 'number', example: statusCode },
                    data: { $ref: getSchemaPath(dataType) },
                },
            },
        }),
    );

export const ApiSuccessArrayResponse = <T extends new (...args: any[]) => any>(
    dataType: T,
    statusCode: 200 | 201 = 200,
    description = 'Success',
) =>
    applyDecorators(
        ApiExtraModels(dataType),
        ApiResponse({
            status: statusCode,
            description,
            schema: {
                properties: {
                    statusCode: { type: 'number', example: statusCode },
                    data: { type: 'array', items: { $ref: getSchemaPath(dataType) } },
                },
            },
        }),
    );
