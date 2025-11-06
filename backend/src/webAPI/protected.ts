import express from "express";
import type { Response, Request } from "express";
import z, { ZodError } from "zod";
import authMiddleware from "./auth.js";
import type HistoryManager from "../history.js";

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
