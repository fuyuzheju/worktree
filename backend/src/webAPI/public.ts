import express from "express"
import type { Request, Response } from 'express';
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { JWTPayloadType } from "./_shared.js";

const prisma = new PrismaClient();

function createPublicRouter() {
    const healthCheck = (req: Request, res: Response) => {
        res.send("Server running");
    }

    const register = async (req: Request, res: Response) => {
        if (!req.body) {
            res.status(400).json({"message": "missing fields"});
            return;
        }
        const username = req.body.username;
        const password = req.body.password;
        if (typeof username !== "string" || typeof password !== "string") {
            res.status(400).json({"message": "missing username or password"});
            return;
        }

        const usernameRegex = /^[A-Za-z0-9_-]{1,32}$/;
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{1,32}$/
        if (!usernameRegex.test(username)) {
            res.status(400).json({"message": "invalid username"});
            return;
        }
        if (!passwordRegex.test(password)) {
            res.status(400).json({"message": "invalid password"});
            return;
        }

        const user = await prisma.user.findUnique({
            where: {
                name: username
            }
        });
        if (user !== null) {
            res.status(400).json({"message": "The username already exists"});
            return;
        }

        await createUser(username, crypto.createHash("sha256").update(password).digest("hex"));
        res.status(200).json({"message": "success"});
    }

    const login = async (req: Request, res: Response) => { // json midware required
        if (!req.body) {
            res.status(400).json({"message": "missing fields"});
            return;
        }
        const username = req.body.username;
        const password = req.body.password;
        if (typeof username !== "string" || typeof password !== "string") {
            res.status(400).json({"message": "missing fields"});
            return;
        }

        const user = await getUserByName(username);
        if (user === null) {
            res.status(401).json({"message": "wrong username or password"});
            return;
        }

        const hash = crypto.createHash("sha256").update(password).digest("hex");
        if (hash !== user.password_hash) {
            res.status(401).json({"message": "wrong username or password"});
        }

        const payload: JWTPayloadType = {
            user_id: user.id,
        }

        const secretKey = process.env.JWT_SECRET_KEY;
        if (secretKey === undefined) throw new Error("No env variable named 'secretKey'.");
        const token = jwt.sign(payload, secretKey, {
            expiresIn: "1h",
        });
        res.status(200).json({
            "userId": user.id,
            "accessToken": token,
        });
    }

    const publicRouter = express.Router();
    publicRouter.get("/health/", healthCheck);
    publicRouter.post("/register/", register);
    publicRouter.post("/login/", login);
    return publicRouter;
}

async function getUserByName(name: string) {
    const user = await prisma.user.findUnique({
        where: {
            name: name
        }
    });
    return user;
}

export async function createUser(name: string, passwordHash: string) {
    const user = await prisma.user.create({
        data: {
            name: name,
            password_hash: passwordHash,
        }
    });
    const metadata = await prisma.historyMetadata.create({
        data: {
            head_id: null,
            user_id: user.id,
        }
    });
    return user;
}

export default createPublicRouter;