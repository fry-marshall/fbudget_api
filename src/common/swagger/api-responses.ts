import { ApiProperty } from "@nestjs/swagger";

export class ErrorResponse {
    @ApiProperty({ example: 'Error message' })
    message?: string;

    @ApiProperty({ example: 400 })
    statusCode?: number;
}
