import { PrismaClient } from "../generated/prisma/index.js";
import crypto from "crypto";
import type Operation from "./core/operation.js";
import { number } from "zod";

const prisma = new PrismaClient();

export default class HistoryManager {
    constructor() {}

    async createUser(userId: number, name: string) {
        const user = await prisma.user.create({
            data: {
                id: userId,
                name: name,
            }
        });
        const metadata = await prisma.historyMetadata.create({
            data: {
                headId: null,
                userId: user.id,
            }
        });
        return user;
    }

    async insertAtHead(operation: Operation, userId: number): Promise<number> {
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
        const newHash = calculateHash(prevHash, operation.stringify());
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

    async getHeadNode(userId: number) {
        const metadata = await prisma.historyMetadata.findUnique({
            where: {userId: userId},
            include: {head: true},
        });
        if (metadata === null) return null;
        
        return metadata.head;
    }
}

function calculateHash(prevHash: string, op_str: string): string {
    return crypto.createHash("sha256").update(prevHash + op_str).digest("hex");
}
