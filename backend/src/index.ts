import express from 'express';
import type { Request, Response, NextFunction} from 'express';
import dotenv from "dotenv";

import { healthCheck, login } from './APIs.js';

dotenv.config();

const app = express();
const port = 824;

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;
const asyncHandler = (fn: AsyncRequestHandler) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn).catch(next);
    }
}

app.use(express.json());
app.get('/health/', healthCheck);
app.post('/login/', asyncHandler(login));

app.listen(port, () => {
    console.log(`Server running on port ${port}.`);
});
