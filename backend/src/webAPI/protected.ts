import express from "express";
import type { Response, Request } from "express";
import z, { ZodError } from "zod";
import authMiddleware from "./auth.js";
import type HistoryManager from "../history.js";
import type { Operation, OperationType } from "../data/core.js";
import { parseOperation } from "../data/utils.js";
import type { TreeLoader } from "../loader.js";
import { AsyncLock } from "./_shared.js";
import { rooms } from "./websocket.js";

function createProtectedRouter(
    historyManager: HistoryManager,
    loader: TreeLoader,
    historyLock: AsyncLock,
) {
    const lengthGet = async (req: Request, res: Response) => {
        if (!req.user) {
            console.log(req);
            throw new Error("Auth passed, but no field 'user' found.");
        }

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
        if (!req.user) {
            console.log(req);
            throw new Error("Auth passed, but no field 'user' found.");
        }

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
        if (!req.user) {
            console.log(req);
            throw new Error("Auth passed, but no field 'user' found.");
        }

        const nodes = await historyManager.getBySerialNums(req.user.user_id, serialNums);
        res.status(200).json(nodes.map(node => node.history_hash));
    }

    const overwrite = async (req: Request, res: Response) => {
        await historyLock.acquire(req.user!.user_id);
        console.log("lock got")
        if (!req.body) {
            res.status(400).json({"message": "invalid fields."});
            historyLock.release(req.user!.user_id);
            return;
        }
        const startingSerialNum = req.body.starting_serial_num;
        const operation_strings = req.body.operations;
        if (typeof startingSerialNum !== "number") {
            console.log("??");
            res.status(400).json({"message": "invalid fields."});
            historyLock.release(req.user!.user_id);
            return;
        }
        const arrayStringSchema = z.array(z.string());
        let operations: Operation<OperationType>[];
        try {
            operations = arrayStringSchema.parse(operation_strings).
                map(operation_string => parseOperation(operation_string)).
                map(operation => {if (operation === null) throw new TypeError(); return operation;});
        } catch (error) {
            console.log(operation_strings);
            res.status(400).json({"message": "invalid fields."});
            historyLock.release(req.user!.user_id);
            return;
        }

        // overwrite
        const code = await historyManager.overwrite(req.user!.user_id, startingSerialNum, operations!);
        if (code !== 0) {
            console.log("!!!");
            res.status(400).json({"message": "failed to overwrite"});
            historyLock.release(req.user!.user_id);
            return;
        }
        console.log(3);

        // close all client connection to reconnect-init
        const room = rooms.get(req.user!.user_id);
        if (room) {
            room.forEach(client => {client.close()});
            // rooms.delete(req.user!.user_id);
        }

        res.status(200).json({"message": "success"});

        historyLock.release(req.user!.user_id);
        await loader.reload(req.user!.user_id);
    }

    // register auth middleware to parse JWT before accessing protected APIs
    const protectedRouter = express.Router();
    protectedRouter.use(authMiddleware);
    protectedRouter.get("/length", lengthGet);
    protectedRouter.get("/operations", operationsGet);
    protectedRouter.get("/hashcodes", hashcodesGet);
    protectedRouter.post("/overwrite", overwrite);
    return protectedRouter;
}

export default createProtectedRouter;
