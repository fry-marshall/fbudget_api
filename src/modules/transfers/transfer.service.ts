import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DataSource, In, QueryFailedError } from "typeorm";
import { ERRORS_MESSAGES } from "src/common/constants";
import { Account } from "../accounts/account.entity";
import { Transaction } from "../transactions/transaction.entity";
import { toTransactionDto } from "../transactions/transaction.mapper";
import { TransactionSourceType } from "../transactions/types";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { TransferResponseDto } from "./dto/transfer-response.dto";

const FOREIGN_KEY_VIOLATION = '23503'

@Injectable()
export class TransferService {

    constructor(
        private dataSource: DataSource
    ) { }

    /**
     * Debit the source account and credit the destination account in one DB transaction, both linked by the same transferId
     */
    async create(userId: string, { fromAccountId, toAccountId, amount, occurredOn, note }: CreateTransferDto): Promise<TransferResponseDto> {
        if (fromAccountId === toAccountId) {
            throw new BadRequestException(ERRORS_MESSAGES.TRANSFERS.SAME_ACCOUNT)
        }

        try {
            return await this.dataSource.transaction(async (manager) => {
                if ((await manager.count(Account, { where: { id: In([fromAccountId, toAccountId]), userId } })) !== 2) {
                    throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
                }

                const transferId = randomUUID()
                const leg = { occurredOn, note: note ?? null, sourceType: TransactionSourceType.TRANSFER, transferId, userId }
                const [from, to] = await manager.save(Transaction, [
                    { ...leg, amount: -amount!, accountId: fromAccountId },
                    { ...leg, amount: amount!, accountId: toAccountId },
                ])

                return { transferId, from: toTransactionDto(from), to: toTransactionDto(to) }
            })
        } catch (err) {
            this.handleForeignKeyViolation(err)
            throw err
        }
    }

    /**
     * The user or an account may be deleted between the check and the write
     */
    private handleForeignKeyViolation(err: unknown): void {
        if (err instanceof QueryFailedError && err.driverError.code === FOREIGN_KEY_VIOLATION) {
            if (String(err.driverError.detail).includes('accountId')) {
                throw new NotFoundException(ERRORS_MESSAGES.ACCOUNTS.ACCOUNT_NOT_FOUND)
            }
            throw new NotFoundException(ERRORS_MESSAGES.AUTH.USER_NOT_FOUND)
        }
    }
}
