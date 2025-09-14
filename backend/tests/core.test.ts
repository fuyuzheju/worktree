import Tree from "@/core/tree.js";
import Operation from "@/core/operation.js";
import { OperationType } from "@/core/operation.js";
import crypto from "crypto";

describe("core", () => {
    let tree = new Tree();
    it("tree creation", () => {
        expect(tree.root.name).toBe("WorkRoot");
        expect(tree.root.identity).toBe(crypto.createHash("sha256").update("WorkRoot", "utf8").digest("hex"));
    });
})

