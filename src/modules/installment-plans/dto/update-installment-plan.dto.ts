import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsString, IsUUID, ValidateIf } from "class-validator";
import { InstallmentPlanStatus } from "../types";

export class UpdateInstallmentPlanDto {
    @ApiPropertyOptional({ example: 'iPhone 15' })
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    label?: string;

    @ApiPropertyOptional({ example: 'Klarna', nullable: true, description: 'null to remove it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsString()
    @IsNotEmpty()
    provider?: string | null;

    @ApiPropertyOptional({ enum: [InstallmentPlanStatus.CANCELLED], description: 'Cancel the plan, final: a cancelled plan cannot be changed nor paid anymore' })
    @ValidateIf((_, value) => value !== undefined)
    @IsIn([InstallmentPlanStatus.CANCELLED])
    status?: InstallmentPlanStatus;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Account of the connected user, null to unlink it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    accountId?: string | null;

    @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Category of the connected user, null to unlink it' })
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    categoryId?: string | null;
}
