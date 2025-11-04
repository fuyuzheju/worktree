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
            where: {userId: userId},
            include: {head: true},
        });
        if (metadata === null) return null;
        
        return metadata.head;
    }

    async getById(id: number) {
        const node = await prisma.confirmedHistory.findUnique({
            where: {id: id},
        });
        return node;
    }

    async insertAtHead(operation: Operation<OperationType>, userId: string): Promise<number> {
        const metadata = await prisma.historyMetadata.findUnique({
            where: {userId: userId},
            include: {head: true},
        });

        if (metadata === null) {
            return -1;
        }

        const head = metadata.head;
        const newSerial = head === null? 0 : head.serialNum + 1;
        const prevHash = head === null? "" : head.historyHash;
        const newHash = calculateHash(prevHash, operation);
        const newNode = await prisma.confirmedHistory.create({
            data: {
                serialNum: newSerial,
                historyHash: newHash,
                operation: operation.stringify(),
                nextId: metadata.headId,
                userId: userId,
            }
        });
        await prisma.historyMetadata.update({
            where: {id: metadata.id},
            data: {
                headId: newNode.id
            }
        });

        return 0;
    }

    async popHead(userId: string): Promise<number> {
        const metadata = await prisma.historyMetadata.findUnique({
            where: {userId: userId},
            include: {head: true}
        });

        if (metadata === null) return -1;
        if (metadata.head === null) return -1;
        
        await prisma.historyMetadata.update({
            where: {id: metadata.id},
            data: {
                headId: metadata.head.nextId
            }
        });
        return 0;
    }
}

function calculateHash(prevHash: string, operation: Operation<OperationType>): string {
    return crypto.createHash("sha256").update(prevHash + operation.stringify()).digest("hex");
}
