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
