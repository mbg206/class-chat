import { createServer } from "node:http";
import { readdirSync, createReadStream, readFileSync } from "node:fs";
import { sep as S } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { MessageStyle, MessageType, MIME_TYPES } from "./shared/types.js";
import { createMessageBuffer, createServerMessageBuffer, createStringBuffer } from "./util.js";
import { validateName, CONTROL_BYTE } from "./shared/shared-util.js";
import { parseMarkdown } from "./markdown.js";

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
        const targetName = args[0];

        if (targetName === socket.name) {
            socket.send(createServerMessageBuffer(room, "You can't message yourself, silly!"));
            return;
        }

        let target = null;
        for (const s of server.clients) {
            if (s.name === targetName && s.rooms.has(room)) {
                target = s;
                break;
            }
        }
        
        if (target === null)
            socket.send(createServerMessageBuffer(room, `User ${targetName} not found!`));

        else {
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
    }

    else socket.send(createServerMessageBuffer(room, "Unknown command. Type /help for a list of available commands."));
};

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