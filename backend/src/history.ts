import { Prisma, PrismaClient, type ConfirmedHistory } from "@prisma/client";
import crypto, { hash } from "crypto";
import type { Operation, OperationType } from "./data/core.js";
// const prisma = (new PrismaClient({
//     datasources: {
//         db: {
//             url: process.env.DATABASE_URL as string
//         }
//     }
// })).$extends({
//     model: {
//         user: {
//             $omit: {passwordHash: true}
//         }
//     }
// }); // restrict the client from accessing authorizing data by default

async function retryTransaction<T>(
    prisma: PrismaClient,
    query: (prisma: Prisma.TransactionClient) => Promise<T>,
    maxRetries: number,
    delayMs: number,
) {
    let attempt = 0;
    while (true) {
        attempt++;
        try {
            const result = await prisma.$transaction(query, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            });
            return result;
        } catch (error) {
            console.log("Failed.")
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code == "P2034") {
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                } else {
                    console.log("Max retries exceeded.");
                    throw error;
                }
            }

            throw error;
        }
    }
}

export default class HistoryManager {
    prisma: PrismaClient
    constructor() {
        this.prisma = new PrismaClient();
    }

    async getHeadNode(userId: string) {
        const metadata = await this.prisma.historyMetadata.findUnique({
            where: { user_id: userId },
            include: { head: true },
        });
        if (metadata === null) return null;

        return metadata.head;
    }

    async getByIds(ids: number[]) {
        const nodes = await this.prisma.confirmedHistory.findMany({
            where: { id: { in: ids } },
        });
        return nodes;
    }

    async getBySerialNums(userId: string, serialNums: number[]): Promise<ConfirmedHistory[]> {
        let curr = await this.getHeadNode(userId);
        let result = new Map<number, ConfirmedHistory>();
        while (curr !== null) {
            if (serialNums.includes(curr.serial_num))
                result.set(curr.serial_num, curr);

            curr = (await this.getByIds([curr.next_id ?? -1]))[0] ?? null;
        }

        const retval = Array.from(result.values()).sort((a, b) => a.serial_num-b.serial_num);
        return retval;
    }

    async insertAtHead(operation: Operation<OperationType>, userId: string) {
        const transaction = async function (prisma: Prisma.TransactionClient) {
            const metadata = await prisma.historyMetadata.findUnique({
                where: { user_id: userId },
                include: { head: true },
            });

            if (metadata === null) {
                return null;
            }

            const head = metadata.head;
            const newSerial = head === null ? 1 : head.serial_num + 1;
            const prevHash = head === null ? "" : head.history_hash;
            const newHash = calculateHash(prevHash, operation);
            const newNode = await prisma.confirmedHistory.create({
                data: {
                    serial_num: newSerial,
                    history_hash: newHash,
                    operation: operation.stringify(),
                    next_id: metadata.head_id,
                    user_id: userId,
                }
            });
            await prisma.historyMetadata.update({
                where: { id: metadata.id },
                data: {
                    head_id: newNode.id
                }
            });

            return newNode;
        }

        return await retryTransaction(this.prisma, transaction, 3, 50);
    }

    async popHead(userId: string): Promise<number> {
        const transaction = async function (prisma: Prisma.TransactionClient) {
            const metadata = await prisma.historyMetadata.findUnique({
                where: { user_id: userId },
                include: { head: true }
            });

            if (metadata === null) return -1;
            if (metadata.head === null) return -1;

            await prisma.historyMetadata.update({
                where: { id: metadata.id },
                data: {
                    head_id: metadata.head.next_id
                }
            });
            return 0;
        }
        return await retryTransaction(this.prisma, transaction, 3, 50);
    }

    async overwrite(userId: string,
        startingSerialNum: number,
        operations: Operation<OperationType>[]): Promise<number> {
        console.log(`OVERWRITE: ${userId}, ${startingSerialNum}`)
        const transaction = async function (prisma: Prisma.TransactionClient) {
            let metadata = await prisma.historyMetadata.findUnique({
                where: {
                    user_id: userId
                }
            });
            if (metadata === null) return -1;

            let prev = await prisma.confirmedHistory.findFirst({
                where: {
                    user_id: userId,
                    serial_num: startingSerialNum - 1,
                }
            });
            if (prev === null && startingSerialNum !== 1) {
                console.log(prev, startingSerialNum);
                return -1;
            }

            let hashcode: string = prev === null ? "" : prev.history_hash;
            for (const [i, operation] of operations.entries()) {
                hashcode = calculateHash(hashcode, operation);
                console.log(prev);
                const newNode = await prisma.confirmedHistory.create({
                    data: {
                        serial_num: startingSerialNum + i,
                        history_hash: hashcode,
                        operation: operation.stringify(),
                        next_id: prev === null ? null : prev.id,
                        user_id: userId,
                    }
                });
                prev = newNode;
            }

            await prisma.historyMetadata.update({
                where: { id: metadata.id },
                data: {
                    head_id: prev === null ? null : prev.id,
                }
            });

            return 0;
        }
        return await retryTransaction(this.prisma, transaction, 3, 50);
    }
}

function calculateHash(prevHash: string, operation: Operation<OperationType>): string {
    return crypto.createHash("sha256").update(prevHash + operation.stringify()).digest("hex");
}
