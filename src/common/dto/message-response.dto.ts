import { ApiProperty } from "@nestjs/swagger";

export class MessageResponseDto {
    @ApiProperty({ example: 'User logout successfully' })
    message?: string;
}
