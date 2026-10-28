import { ApiProperty } from "@nestjs/swagger";
import { CategoryType } from "../types";

export class CategoryResponseDto {
    @ApiProperty({ format: 'uuid' })
    id?: string;

    @ApiProperty({ enum: CategoryType })
    type?: CategoryType;

    @ApiProperty({ example: 'Netflix', nullable: true })
    label?: string | null;

    @ApiProperty({ example: 14000, nullable: true, description: 'Monthly envelope budget in the smallest unit of the primary currency' })
    envelopeBudget?: number | null;

    @ApiProperty()
    createdAt?: Date;
}
