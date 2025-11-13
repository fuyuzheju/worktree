import type { OperationType } from "./core.js";
import { Operation, TreeOperationPayloadSchemas } from "./core.js";

export function isOperation<T extends OperationType>
        (obj: any, opType: T): obj is Operation<T> {
    if (typeof obj !== 'object' || obj === null ||
        !(obj.opType in TreeOperationPayloadSchemas) ||
        typeof obj.payload !== "object" || 
        typeof obj.timestamp !== "number"
    ) {
        return false;
    }
    if (obj.opType !== opType) {
        return false;
    }

    const schema = TreeOperationPayloadSchemas[opType];
    const result = schema.safeParse(obj.payload);
    return result.success;
}

export function parseOperation(s: string): Operation<OperationType> | null {
    let data;
    try {
        data = snakeToCamelObject(JSON.parse(s));
    } catch (error) {
        return null;
    }
    if (data === null || typeof data !== "object" ||
        !(data.opType in TreeOperationPayloadSchemas) ||
        typeof data.payload !== "object" ||
        typeof data.timestamp !== "number"
    ) {
        return null; 
    }

    const opType = data.opType as OperationType;
    const schema = TreeOperationPayloadSchemas[opType];
    try {
        const parsedPayload = schema.parse(data.payload);
        return new Operation({
            opType: opType,
            payload: parsedPayload,
            timestamp: data.timestamp,
        });
    } catch (error) {
        return null;
    }
}

function snakeToCamel(s: string): string {
    return s.split('_').map((word, i) => 
        (word.length === 0 || i === 0) ? word : word[0]?.toUpperCase() + word.slice(1)
    ).reduce((prev, next) => prev+next);
}
function snakeToCamelObject(o: any): any{
    if (typeof o === 'object')
        return Object.keys(o).reduce((acc, key) => {
            const keyCamel = snakeToCamel(key);
            // @ts-expect-error
            acc[keyCamel] = snakeToCamelObject(o[key]);
            return acc;
        }, {});
    else if (typeof o === 'string') return snakeToCamel(o);
    else return o;
}
