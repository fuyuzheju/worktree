import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import type { Operation, OperationType } from "./data/core.js";

const prisma = (new PrismaClient()).$extends({
    model: {
        user: {
            $omit: {passwordHash: true}
        }
    }
}); // restrict the client from accessing authorizing data by default

export default class HistoryManager {
    constructor() {}

    async getHeadNode(userId: string) {
        const metadata = await prisma.historyMetadata.findUnique({
            where: {user_id: userId},
            include: {head: true},
        });
        if (metadata === null) return null;
        
        return metadata.head;
    }

    async getByIds(ids: number[]) {
        const nodes = await prisma.confirmedHistory.findMany({
            where: {id: {in: ids}},
        });
        return nodes;
    }

    async getBySerialNums(userId: string, serialNums: number[]) {
        const nodes = await prisma.confirmedHistory.findMany({
            where: {
                user_id: userId,
                serial_num: {in: serialNums},
            }
        });
        return nodes;
    }

    async insertAtHead(operation: Operation<OperationType>, userId: string): Promise<number> {
        const metadata = await prisma.historyMetadata.findUnique({
            where: {user_id: userId},
            include: {head: true},
        });

        if (metadata === null) {
            return -1;
        }

        const head = metadata.head;
        const newSerial = head === null? 0 : head.serial_num + 1;
        const prevHash = head === null? "" : head.history_hash;
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
            where: {id: metadata.id},
            data: {
                head_id: newNode.id
            }
        });

        return 0;
    }

    async popHead(userId: string): Promise<number> {
        const metadata = await prisma.historyMetadata.findUnique({
            where: {user_id: userId},
            include: {head: true}
        });

        if (metadata === null) return -1;
        if (metadata.head === null) return -1;
        
        await prisma.historyMetadata.update({
            where: {id: metadata.id},
            data: {
                head_id: metadata.head.next_id
            }
        });
        return 0;
    }
}

function calculateHash(prevHash: string, operation: Operation<OperationType>): string {
    return crypto.createHash("sha256").update(prevHash + operation.stringify()).digest("hex");
}
