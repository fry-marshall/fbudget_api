import { ApiProperty } from "@nestjs/swagger";
import { CategoryType } from "src/modules/categories/types";

/**
 * Expenses of a category in the month against its envelope, the front picks the color from pct
 */
export class CategoryPacingDto {
    @ApiProperty({ example: '6f1c2b8e-3d4a-4b5c-9e7f-1a2b3c4d5e6f' })
    categoryId?: string;

    @ApiProperty({ enum: CategoryType, example: CategoryType.GROCERIES })
    type?: CategoryType;

    @ApiProperty({ type: String, nullable: true, example: null, description: 'Set for the other categories only' })
    label?: string | null;

    @ApiProperty({ example: 14830, description: 'Net of the confirmed manual transactions of the category in the month, a refund lowers it, never below 0' })
    spent?: number;

    @ApiProperty({ type: Number, nullable: true, example: 20000 })
    envelopeBudget?: number | null;

    @ApiProperty({ type: Number, nullable: true, example: 74, description: 'spent × 100 / envelopeBudget rounded down, can exceed 100, null without positive envelope' })
    pct?: number | null;
}
