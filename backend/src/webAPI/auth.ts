import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWTPayloadSchema } from "./_shared.js";

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    try {
        let token: string|undefined = undefined;

        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
            token = authHeader.replace("Bearer ", " ");
        }
        if (!token) {
            res.status(401).json({"message": "No access token found."});
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
        res.status(401).send("Invalid access token.");
    }
}

export default authMiddleware;