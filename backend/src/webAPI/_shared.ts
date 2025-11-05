import z from "zod";

export const JWTPayloadSchema = z.object({
    user_id: z.string(),
});
export type JWTPayloadType = z.infer<typeof JWTPayloadSchema>