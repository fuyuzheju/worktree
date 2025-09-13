// const express = require("express");
// const ws = require("ws");
// const http = require("http");

// const app = express();
// const server = http.createServer(app);
// const wss = new ws.Server({server});

// app.use(express.json());

// app.get("/health/", (req, res) => {
//     res.json({status: 'ok', message: 'running'});
// });

// let serial_num = 1;

// wss.on("connection", (websocket) => {
//     websocket.on("message", (message) => {
//         data = JSON.parse(message);
//         console.log(data);
//         websocket.send(JSON.stringify({
//             operation: data,
//             serial_num: serial_num,
//         }));
//         serial_num += 1;
//     });
// });

// const PORT = 1215;
// server.listen(PORT, () => {
//     console.log(`listening on ${PORT}`);
// })

import Tree from "./core/tree.js";
import Operation from "./core/operation.js";
import { OperationType } from "./core/operation.js";
let tree = new Tree();

tree.addNode({
    parentNodeId: tree.root.identity,
    newNodeName: "1",
});

let op = new Operation({
    opType: OperationType.ADD_NODE,
    payload: {
        parentNodeId: tree.root.identity,
        newNodeName: "2",
    },
    timestamp: 0,
});

op.apply(tree);

console.log(tree.root);

