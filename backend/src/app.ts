import express, { type Request, type Response, type NextFunction } from 'express';
import expressWs from "express-ws";

import createPublicRouter from './webAPI/public.js';
import createProtectedRouter from './webAPI/protected.js';
import createWebsocketRouter from './webAPI/websocket.js';
import HistoryManager from './history.js';
import { TreeLoader } from './loader.js';

function createApp() {
    const instance = expressWs(express());
    const {app, getWss} = instance;

    const testMW = (req: Request, res: Response, next: NextFunction) => {
        console.log("### Request ###");
        console.log(req.url);
        console.log(req.body);
        next();
    }

    const historyManager = new HistoryManager();
    const treeLoader = new TreeLoader(historyManager);
    const publicRouter = createPublicRouter();
    const protectedRouter = createProtectedRouter(historyManager);
    const websocketRouter = createWebsocketRouter(instance, treeLoader, historyManager);

    const jsonMiddleware = express.json();
    app.use(testMW);
    app.use("/public/", jsonMiddleware, publicRouter);
    app.use("/history/", jsonMiddleware, protectedRouter);
    app.use("/", websocketRouter);
    return app;
}
export default createApp;
