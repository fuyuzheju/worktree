import "express";
import { JWTPayloadType } from "@/webAPI/_shared.ts";
// extend type Response to declare the existence of the field userId
declare global {
    namespace Express {
        export interface Request {
            user?: JWTPayloadType,
        }
    }
}
