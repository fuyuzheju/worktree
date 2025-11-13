import z from "zod";

export const JWTPayloadSchema = z.object({
    user_id: z.string(),
});
export type JWTPayloadType = z.infer<typeof JWTPayloadSchema>

export class AsyncLock {
    /*
    Async lock imitates an async queue.
    */
    private queues = new Map<string, Array<()=>void>>();

    public acquire(key: string): Promise<void> {
        const queue = this.queues.get(key);
        if (queue === undefined) {
            // lock available
            this.queues.set(key, []);
            return Promise.resolve();
        }
        else {
            // lock unavailable
            return new Promise(resolve => {
                queue.push(resolve);
            });
        }
    }

    public release(key: string): void {
        const queue = this.queues.get(key);
        if (queue === undefined) return ;
        else {
            const next = queue.shift();
            if (next === undefined) {
                this.queues.delete(key);
            } else {
                next(); // resolve the head
            }
        }
    }
}