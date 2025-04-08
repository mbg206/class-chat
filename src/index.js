import { createServer } from "node:http";
import { readdirSync, createReadStream, readFileSync } from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import sharp from "sharp";
import { MessageStyle, MessageType, MIME_TYPES } from "./shared/types.js";
import { createMessageBuffer, createServerMessageBuffer, createStringBuffer } from "./util.js";
import { validateName, CONTROL_BYTE } from "./shared/shared-util.js";
import { parseMarkdown } from "./markdown.js";

const FUN_ENABLED = process.env.FUN || true;

const PORT = process.env.PORT || 8000;
const FILES = new Map([
    ...readdirSync("src", {recursive: true, withFileTypes: true})
        .map(f => {
            const path = f.parentPath.replaceAll("\\", "/");
            const isShared = path.startsWith(`src/shared`);
            if (!isShared && !path.startsWith(`src/html`))
                return null;
            return [
                f.name,
                {path: `${path}/${f.name}`, shared: isShared, mime: MIME_TYPES[f.name.slice(f.name.indexOf(".") + 1)]}
            ];
        }).filter(f => f !== null)
]);

const httpServer = createServer((req, res) => {
    if (req.method !== "GET") {
        res.writeHead(405);
        res.end("Method Not Allowed");
        return;
    }

    const fileName = req.url === "/" ? "index.html" : req.url.slice(1);
    if (!FILES.has(fileName)) {
        res.writeHead(404).end("File Not Found");
        return;
    }
    const file = FILES.get(fileName);

    res.writeHead(200, {"Content-Type": file.mime});
    
    if (file.shared) {
        const contents = readFileSync(file.path).toString("utf-8");
        res.end(contents.replaceAll("export ", ""));
    }

    else createReadStream(file.path).pipe(res);
}).listen(PORT, "0.0.0.0");

// web sockets

const server = new WebSocketServer({path: "/chat", noServer: true, maxPayload: 10e+6}); // 10mb

const broadcast = (room, components, fromServer = false) => {
    const data = fromServer ? createServerMessageBuffer(room, components) : createMessageBuffer(room, components);

    server.clients.forEach((s) => {
        if (s.name !== undefined && s.readyState == WebSocket.OPEN && s.rooms.has(room))
            s.send(data);
    });
};

const HELP_MENU = [
    "List of available commands:\n\n",
    "/help"," - Shows a list of available commands\n",
    "/online"," - Displays a list of online users\n",
    "/msg"," <user> <message> - Privately messages a single user in the current room",
].map((a, i) => ({
    style: (i % 2 == 1) ? MessageStyle.UNDERLINE : MessageStyle.PLAIN,
    content: a
}));

const findUser = (name, room) => {
    let target = null;
    for (const s of server.clients) {
        if (s.name === name && s.rooms.has(room)) {
            target = s;
            break;
        }
    }
    return target;
};
const handleCommand = (socket, room, command, args) => {
    if (command === "help")
        socket.send(createServerMessageBuffer(room, HELP_MENU));

    else if (command === "online") {
        const names = [];
        server.clients.forEach((s) => {
            if (s.rooms.has(room))
                names.push(s.name);
        });

        socket.send(createServerMessageBuffer(room, [
            {
                style: MessageStyle.PLAIN,
                content: `Users in the current room:\n`
            },
            {
                style: MessageStyle.BOLD,
                content: names.join("\n")
            },
            {
                style: MessageStyle.PLAIN,
                content: `\n\nNumber of users in this room: ${names.length}\nNumber of users globally: ${server.clients.size}`
            }
        ]));
    }

    else if (command === "msg") {
        if (args.length === 0)
            return socket.send(createServerMessageBuffer(room, "No target specified!"));

        const targetName = args[0];

        if (targetName === socket.name)
            return socket.send(createServerMessageBuffer(room, "You can't message yourself, silly!"));

        const target = findUser(targetName, room);
        
        if (target === null)
            return socket.send(createServerMessageBuffer(room, `User ${targetName} not found!`));

        const content = args.slice(1).join(" ").trim();
        if (content.length === 0)
            socket.send(createServerMessageBuffer(room, `Message content empty!`));
        else {
            socket.send(createServerMessageBuffer(room, [
                {
                    style: MessageStyle.UNDERLINE,
                    content: "You to "
                },
                {
                    style: MessageStyle.UNDERLINE | MessageStyle.BOLD,
                    content: targetName
                },
                {
                    style: MessageStyle.PLAIN,
                    content: ": "
                },
                {style: MessageStyle.NEWBLOCK},
                {
                    style: MessageStyle.PLAIN,
                    content: content
                }
            ]));
            
            target.send(createServerMessageBuffer(room, [
                {
                    style: MessageStyle.UNDERLINE | MessageStyle.BOLD,
                    content: targetName
                },
                {
                    style: MessageStyle.UNDERLINE,
                    content: " to you"
                },
                {
                    style: MessageStyle.PLAIN,
                    content: ": "
                },
                {style: MessageStyle.NEWBLOCK},
                {
                    style: MessageStyle.PLAIN,
                    content: content
                }
            ]));
        }
    }

    
    else if (FUN_ENABLED && (command === "barrelroll" || command === "spinout" || command === "small" || command === "flyout")) {
        let target;
        if (args.length === 0)
            target = socket;
        else {
            target = findUser(args[0], room);
        
            if (target === null)
                return socket.send(createServerMessageBuffer(room, `User ${args[0]} not found!`));
        }

        let name;
        let timeout;
        let index;
        if (command === "barrelroll") {
            name = "Barrel roll'ed";
            timeout = 2500;
            index = 0;
        }
        else if (command === "spinout") {
            name = "Spin-out'd";
            timeout = 6500;
            index = 1;
        }
        else if (command === "small") {
            name = "Small DVD'd";
            timeout = 9000;
            index = 2;
        }
        else if (command === "flyout") {
            name = "Fly-out'd";
            timeout = 6500;
            index = 3;
        }
        socket.send(createServerMessageBuffer(room, `${name} ${target.name}`));

        const data = Buffer.alloc(2);
        data.writeUint8(MessageType.FUN);
        data.writeUint8(index, 1);
        target.send(data);

        if (target !== socket)
            setTimeout(() =>
                target.send(createServerMessageBuffer(room, `You've been ${name.charAt(0).toLowerCase()}${name.slice(1)} by ${socket.name}`)),
            timeout);
    }

    else socket.send(createServerMessageBuffer(room, "Unknown command. Type /help for a list of available commands."));
};

const IMAGE_TYPES = new Set([
    "image/apng",
    "image/avif",
    "image/gif", 
    "image/jpeg",
    "image/png",
    "image/svg+xml",
    "image/webp"
]);

server.on("connection", (socket) => {
    socket.rooms = new Set();
    socket.pinged = false;

    socket.on("pong", () => socket.pinged = false);
    socket.on("error", console.error);
    socket.on("close", (e) => {
        // e === https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
        const message = e === 1001 ?
            "has left the room" :
            "has lost connection";
        for (const room of socket.rooms.values())
            broadcast(room, `${socket.name} ${message}`, true);
    });

    
    socket.on("message", (data) => {
        if (data.byteLength === 0) return;
        const type = data.readUint8();

        // socket ping
        if (type === MessageType.PING && data.length === 1) {
            socket.send([MessageType.PONG]);
        }
        
        // set name/login
        else if (type === MessageType.REQUEST_NAME) {
            const name = data.toString("utf-8", 1);
            if (!validateName(name)) return;

            for (const s of server.clients.values()) {
                if (s.name === name) {
                    socket.send([MessageType.NAME_FAILURE]);
                    return;
                }
            }

            for (const room of socket.rooms.values()) {
                broadcast(room, `${socket.name} has changed their name to ${name}`, true);
            }
            socket.name = name;

            socket.send(createStringBuffer(MessageType.SET_NAME, name));
        }

        // other message types require socket to be logged in
        else if (socket.name === undefined) return;

        // join room
        else if (type === MessageType.REQUEST_JOIN_ROOM) {
            const room = data.toString("utf-8", 1);
            if (!validateName(room)) return;
            if (socket.rooms.has(room)) return;

            socket.rooms.add(room);
            socket.send(createStringBuffer(MessageType.JOIN_ROOM, room));
            broadcast(room, `${socket.name} has joined the room`, true);
        }

        // leave room
        else if (type === MessageType.REQUEST_LEAVE_ROOM) {
            const room = data.toString("utf-8", 1);
            if (!validateName(room)) return;
            if (!socket.rooms.has(room)) return;

            socket.rooms.delete(room);
            socket.send(createStringBuffer(MessageType.LEAVE_ROOM, room));
            broadcast(room, `${socket.name} has left the room`, true);
        }

        // send message
        else if (type === MessageType.SEND_MESSAGE) {
            const textStart = data.indexOf(CONTROL_BYTE);
            if (textStart === -1) return;

            const room = data.toString("utf-8", 1, textStart);
            if (!validateName(room)) return;

            const messageLength = data.byteLength - textStart - 1;
            if (messageLength > 2048 || messageLength === 0) return;

            const message = data.toString("utf-8", textStart + 1);

            // command handling
            if (message.charAt(0) === "/") {
                const args = message.slice(1).split(" ");
                handleCommand(socket, room, args[0], args.slice(1));
            }

            else broadcast(room, [
                {style: MessageStyle.SENDER | MessageStyle.BOLD, content: socket.name},
                {style: MessageStyle.SENDER, content: ": "},
                {style: MessageStyle.NEWBLOCK},
                ...parseMarkdown(message)
                //{style: MessageStyle.PLAIN, content: message}
            ]);
        }

        // send attachment
        else if (type === MessageType.SEND_ATTACHMENT) {
            const mimeStart = data.indexOf(CONTROL_BYTE);
            if (mimeStart === -1) return;
            const room = data.toString("utf-8", 1, mimeStart);
            
            const dataStart = data.indexOf(CONTROL_BYTE, mimeStart + 1);
            if (dataStart === -1) return;
            const mimeType = data.toString("utf-8", mimeStart + 1, dataStart);
            if (!IMAGE_TYPES.has(mimeType)) return;

            sharp(data.subarray(dataStart + 1)).webp().toBuffer((err, image) => {
                if (err !== null) {
                    console.error(err);
                    socket.send(createServerMessageBuffer(room, "An error occurred while trying to process your file upload"));
                    return;
                }

                const nameLen = Buffer.byteLength(socket.name);
                const roomLen = Buffer.byteLength(room);
                const data = Buffer.alloc(3 + nameLen + roomLen + image.byteLength);
                data.writeUint8(MessageType.RECEIVE_ATTACHMENT);
                data.write(socket.name, 1);
                data.writeUint8(CONTROL_BYTE, 1 + nameLen);
                data.write(room, 2 + nameLen);
                data.writeUint8(CONTROL_BYTE, 2 + nameLen + roomLen);
                data.set(image, 3 + nameLen + roomLen);
                socket.send(data);
            });
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