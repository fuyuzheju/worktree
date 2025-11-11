import express from "express";
import type { Response, Request } from "express";
import z, { ZodError } from "zod";
import authMiddleware from "./auth.js";
import type HistoryManager from "../history.js";

function createProtectedRouter(historyManager: HistoryManager) {
    const lengthGet = async (req: Request, res: Response) => {
        if (!req.user) throw new Error("Auth passed, but no field 'user' found.");

        const head = await historyManager.getHeadNode(req.user.user_id);
        let length: number;
        if (head === null) length = 0;
        else length = head.serial_num;
        res.status(200).json({"length": length});
    }

    const operationsGet = async (req: Request, res: Response) => {
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
        res.status(200).json(nodes.map(node => node.operation));
    }

    const hashcodesGet = async (req: Request, res: Response) => {
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
    protectedRouter.get("/length", lengthGet);
    protectedRouter.get("/operations", operationsGet);
    protectedRouter.get("/hashcodes", hashcodesGet);
    return protectedRouter;
}

export default createProtectedRouter;
