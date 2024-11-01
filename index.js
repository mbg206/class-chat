const {createServer} = require("http");
const fs = require("fs");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8000;
const allowedFiles = fs.readdirSync("src/html");

const MIME_TYPES = {
    "html": "text/html",
    "css": "text/css",
    "js": "text/javascript",
    "woff": "font/woff"
};

const httpServer = createServer((req, res) => {
    if (req.method !== "GET") {
        res.writeHead(405);
        res.end("Method Not Allowed");
        return;
    }

    const file = req.url === "/" ? "index.html" : req.url.slice(1);
    if (!allowedFiles.includes(file)) {
        res.writeHead(404);
        res.end("File Not Found");
        return;
    }

    res.writeHead(200, {"Content-Type": MIME_TYPES[file.slice(file.lastIndexOf(".") + 1)]});
    fs.createReadStream(`src/html/${file}`).pipe(res);
}).listen(PORT, "0.0.0.0");

// web sockets

const server = new WebSocket.Server({path: "/chat", noServer: true, maxPayload: 4096});

const broadcast = (room, msg) => {
    server.clients.forEach((s) => {
        if (s.name !== undefined && s.readyState == WebSocket.OPEN && s.rooms.has(room))
            s.send(msg);
    });
};

server.on("connection", (socket) => {
    socket.rooms = new Set();
    socket.pinged = false;

    socket.on("pong", () => socket.pinged = false);
    socket.on("error", console.error);
    socket.on("close", (e) => {
        const message = e === 1001 ?
            "has left the room" :
            "has lost connection";
        for (const room of socket.rooms.values())
            broadcast(room, `M${room}\t\t${socket.name} ${message}`);
    });

    socket.on("message", (data) => {
        const msg = data.toString();
        
        const type = msg.charAt(0);
        if (type === "N") { // set name
            const name = msg.slice(1).trim();
            if (name.length > 16 || name.length === 0) return;

            let nameTaken = false;
            for (const s of server.clients.values()) {
                if (s.name === name) {
                    nameTaken = true;
                    break;
                }
            }

            if (nameTaken)
                socket.send("F");
            else {
                for (const room of socket.rooms.values())
                    broadcast(room, `M${room}\t\t${socket.name} has changed their name to ${name}`);
                socket.name = name;
                socket.send(msg);
            }
        }

        else if (socket.name === undefined) return;

        else if (type === "J") { // join room
            const room = msg.slice(1).trim();
            if (room.length > 16 || room.length === 0) return;

            if (socket.rooms.has(room)) return;
            socket.rooms.add(room);
            socket.send("J" + room);
            broadcast(room, `M${room}\t\t${socket.name} has joined the room`);
        }

        else if (type === "L") { // leave room
            const room = msg.slice(1).trim();
            if (room.length > 16 || room.length === 0) return;

            socket.rooms.delete(room);
            socket.send("L" + room);
            broadcast(room, `M${room}\t\t${socket.name} has left the room`);
        }

        else if (type === "M") { // send message
            const split = msg.indexOf("\t");
            if (split === -1) return;
            const room = msg.slice(1, split);
            if (room.length > 16 || room.length === 0) return;
            const message = msg.slice(split + 1).trim();
            if (message.length > 2048 || message.length === 0) return;

            broadcast(room, `M${room}\t${socket.name}\t${message}`);
        }
    });
});

setInterval(() => {
    server.clients.forEach((socket) => {
        if (socket.pinged) socket.terminate();

        socket.ping();
        socket.pinged = true;
    });
}, 10000);

httpServer.on("upgrade", (req, socket, head) => {
    if (req.url !== "/chat") return;

    server.handleUpgrade(req, socket, head,
        (socket) => server.emit("connection", socket, req));
});

console.log(`server started on port ${PORT}`);