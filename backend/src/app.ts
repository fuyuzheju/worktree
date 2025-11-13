import express, { type Request, type Response, type NextFunction } from 'express';
import expressWs from "express-ws";

import createPublicRouter from './webAPI/public.js';
import createProtectedRouter from './webAPI/protected.js';
import createWebsocketRouter from './webAPI/websocket.js';
import HistoryManager from './history.js';
import { TreeLoader } from './loader.js';
import { AsyncLock } from './webAPI/_shared.js';

function createApp() {
    const instance = expressWs(express());
    const {app, getWss} = instance;

    const testMW = (req: Request, res: Response, next: NextFunction) => {
        console.log(`### Request ###: ${req.url}`);
        next();
    }

    const treeLock = new AsyncLock();
    const historyManager = new HistoryManager();
    const treeLoader = new TreeLoader(historyManager, treeLock);
    const publicRouter = createPublicRouter();
    const protectedRouter = createProtectedRouter(historyManager, treeLoader, treeLock);
    const websocketRouter = createWebsocketRouter(instance, treeLoader, historyManager, treeLock);

    const jsonMiddleware = express.json();
    app.use(testMW);
    app.use("/public", jsonMiddleware, publicRouter);
    app.use("/history", jsonMiddleware, protectedRouter);
    app.use("/", websocketRouter);
    return app;
}
export default createApp;
