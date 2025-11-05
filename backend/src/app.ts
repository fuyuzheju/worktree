import express from 'express';

import createPublicRouter from './webAPI/public.js';
import createProtectedRouter from './webAPI/protected.js';
import HistoryManager from './history.js';

function createApp() {
    const app = express();

    app.use(express.json()); // almost all corresponding in this app is in json format
    app.use("/public/", createPublicRouter());
    app.use("/history/", createProtectedRouter(new HistoryManager()));
    return app;
}
export default createApp;
