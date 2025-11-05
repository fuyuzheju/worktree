import express from "express";
import type { Response, Request, NextFunction } from "express";
import jwt from "jsonwebtoken";
import z, { ZodError } from "zod";
import { JWTPayloadSchema } from "./_shared.js";
import type HistoryManager from "@/history.js";

const protectedRouter = express.Router();

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            res.status(401).send("No access token found.");
            return;
        }

        const token = authHeader.replace("Bearer ", " ");
        const secretKey = process.env.JWT_SECRET_KEY;
        if (secretKey === undefined) throw new Error("No env variable named 'secretKey'.");

        const decoded = jwt.verify(token, secretKey);
        const parsed = JWTPayloadSchema.parse(decoded); // verify format of payload
        req.user = parsed;
        next();
    } catch (error) {
        res.status(401).send("Invalid access token.");
    }
}

function createProtectedRouter(historyManager: HistoryManager) {
    const operationGet = async (req: Request, res: Response) => {
        if (!req.body?.serial_nums) {
            res.status(400).json({"message": "Missing fields."});
            return;
        }
        const arrayNumberSchema = z.array(z.number());
        let serialNums: number[];
        try {
            serialNums = arrayNumberSchema.parse(req.body.serial_nums);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({"message": "Invalid format"});
                return;
            }
            throw error;
        }
        if (!req.user) throw new Error("Auth passed, but no field 'user' found.");

        const nodes = await historyManager.getBySerialNums(req.user.user_id, serialNums);
        res.status(200).json(nodes.map(node => JSON.parse(node.operation)));
    }

    const hashcodeGet = async (req: Request, res: Response) => {
        if (!req.body?.serial_nums) {
            res.status(400).json({"message": "Missing fields."});
            return;
        }
        const arrayNumberSchema = z.array(z.number());
        let serialNums: number[];
        try {
            serialNums = arrayNumberSchema.parse(req.body.serial_nums);
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({"message": "Invalid format"});
                return;
            }
            throw error;
        }
        if (!req.user) throw new Error("Auth passed, but no field 'user' found.");

        const nodes = await historyManager.getBySerialNums(req.user.user_id, serialNums);
        res.status(200).json(nodes.map(node => node.history_hash));
    }

    // register auth middleware to parse JWT before accessing protected APIs
    const protectedRouter = express.Router();
    protectedRouter.use(authMiddleware);
    protectedRouter.get("operation/", operationGet);
    protectedRouter.get("hashcode/", hashcodeGet);
    return protectedRouter;
}

export default createProtectedRouter;
