import { applyDecorators } from "@nestjs/common";
import { IsISO8601, Matches } from "class-validator";

/**
 * Validate an existing calendar day formatted YYYY-MM-DD, without time
 */
export const IsDateOnly = () => applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/),
    IsISO8601({ strict: true }),
)
