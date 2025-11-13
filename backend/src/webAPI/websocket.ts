import { WebSocket } from "ws";
import { Router, type NextFunction, type Request } from "express";
import type expressWs from "express-ws";
import type { TreeLoader } from "../loader.js";
import { parseOperation } from "../data/utils.js";
import type { Operation, OperationType } from "../data/core.js";
import type HistoryManager from "../history.js";
import { AsyncLock, JWTPayloadSchema } from "./_shared.js";
import jwt from "jsonwebtoken";

// every room contains all connections from a single user
export const rooms = new Map<string, Set<WebSocket>>();

export default function createWebsocketRouter(
        wssInstance: expressWs.Instance,
        treeLoader: TreeLoader,
        historyManager: HistoryManager,
        historyLock: AsyncLock,
) {
    const getWss = wssInstance.getWss;

    const wsAuthMiddleware = (ws: WebSocket, req: Request, next: NextFunction) => {
        try {
            let token: string|undefined = req.query.token?.toString();

            if (!token) {
                ws.close(4001, "Authentication failed");
                return;
            }

            const secretKey = process.env.JWT_SECRET_KEY;
            if (secretKey === undefined) throw new Error("No env variable named 'secretKey'.");

            const decoded = jwt.verify(token, secretKey);
            const parsed = JWTPayloadSchema.parse(decoded); // verify format of payload
            req.user = parsed;
            console.log("Auth: pass");
            next();
        } catch (error) {
            console.log("Auth: failed");
            ws.close(4001, "Authentication failed");
        }
    }

    async function websocketHandler(ws: WebSocket, req: Request) {
        console.log("on connection");
        if (!req.user) {
            console.log(req);
            ws.close();
            throw new Error("Auth passed, but no field 'user' found.");
        }
        if (!rooms.get(req.user.user_id)) {
            // setup user
            rooms.set(req.user.user_id, new Set<WebSocket>());
            await treeLoader.reload(req.user.user_id);
        }
        rooms.get(req.user.user_id)!.add(ws);

        async function onMessage(msg: string) {
            // console.log(`on message: ${msg}`);
            await historyLock.acquire(req.user!.user_id);
            let operation: Operation<OperationType> | null;
            let headSerialNum: number;
            try {
                const data = JSON.parse(msg);
                if ((!data.action) || (!data.expected_serial_num))
                    throw new Error("Missing fields.");

                if (data.action === "update") {
                    if (!data.operation) throw new Error("Missing fields.");
                    headSerialNum = (await historyManager.getHeadNode(req.user!.user_id))?.serial_num ?? 0;
                    if (headSerialNum+1 !== data.expected_serial_num) {
                        historyLock.release(req.user!.user_id);
                        return; // maybe repetitive reception of the same operation
                    }

                    operation = parseOperation(data.operation);
                }
                else throw new Error("Unknown action.");
            } catch (error) {
                if (!(error instanceof Error)) throw error;
                // directly drop the request
                ws.send(JSON.stringify({"action": "error", "message": error.message}))
                console.log(error.message);
                historyLock.release(req.user!.user_id);
                return;
            }

            if (operation === null) {
                console.error("Invalid operation");
                historyLock.release(req.user!.user_id);
                return;
            }

            // now we get a valid operation
            const code = treeLoader.pushOperation(operation, req.user!.user_id);
            if (code !== 0) {
                ws.send(JSON.stringify({"action": "error", "message": "Operation failed."}));
                historyLock.release(req.user!.user_id);
                return;
            }

            // store operation
            const res = await historyManager.insertAtHead(operation, req.user!.user_id);
            if (res === null) throw new Error("Failed to store operation.");
            // broadcast
            const room = rooms.get(req.user?.user_id ?? "");
            if (!room) {
                console.log(rooms);
                console.log(req.user?.user_id);
                throw new Error();
            }
            room.forEach(client => {
                client.send(JSON.stringify({
                    "action": "update",
                    "operation": operation.stringify(),
                    "serial_num": headSerialNum + 1,
                }));
            });
            historyLock.release(req.user!.user_id);
        }

        function onClose() {
            console.log("on close");
            const room = rooms.get(req.user?.user_id ?? "");
            if (!room) throw new Error();
            room.delete(ws);
            if (room.size === 0) {
                // cleanup user
                rooms.delete(req.user!.user_id);
                treeLoader.cleanup(req.user!.user_id);
            }
        }

        ws.on("message", onMessage);

        ws.on("close", onClose);
    }

    const websocketRouter = Router();
    wssInstance.applyTo(websocketRouter); // ensure this router to have `ws` method
    websocketRouter.ws("", wsAuthMiddleware, websocketHandler);
    return websocketRouter;
}