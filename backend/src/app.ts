import express from 'express';
import dotenv from "dotenv";

import createPublicRouter from './webAPI/public.js';
import createProtectedRouter from './webAPI/protected.js';
import HistoryManager from './history.js';

dotenv.config();

const app = express();

app.use(express.json()); // almost all corresponding in this app is in json format
app.use("/public/", createPublicRouter());
app.use("/history/", createProtectedRouter(new HistoryManager()));
export default app;
