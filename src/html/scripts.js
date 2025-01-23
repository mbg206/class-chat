const themeSelect = document.getElementById("theme-select");
const existingTheme = localStorage.getItem("theme");
if (existingTheme !== null)
    themeSelect.value = existingTheme;

const setTheme = () => document.body.className = `theme-${themeSelect.value}`;
themeSelect.addEventListener("input", () => {
    setTheme();
    localStorage.setItem("theme", themeSelect.value);
});
setTheme();

const roomContainer = document.getElementById("rooms");
const downloadButton = document.getElementById("dl-log");
const roomButton = document.getElementById("add-room");
const nameButton = document.getElementById("set-name");
const inputBar = document.getElementById("input");
const sendButton = document.getElementById("send");
const messageContainer = document.getElementById("messages");

const scrollToBottom = () =>
    messageContainer.scrollTo({top: messageContainer.scrollHeight - messageContainer.clientHeight});

const element = (tag, className, text = null) => {
    const e = document.createElement(tag);
    e.className = className;
    if (text !== null)
        e.textContent = text;
    return e;
};

// socket

const indicator = document.getElementById("connection-indicator");
const url = window.location.href;
const socketUrl = `wss${url.slice(url.indexOf(':'))}`;

if (localStorage.getItem("name") === null) {
    localStorage.setItem("name", `user-${Math.floor(Math.random() * 8999) + 1000}`);
    localStorage.setItem("rooms", "[\"general\"]");
}

const updateRoomStorage = (leaveRoom = null) => {
    const rooms = [];
    const elements = roomContainer.children;
    for (let i = 0; i < elements.length; i++) {
        const name = elements[i].children[0].textContent;
        if (name === leaveRoom) elements[i].remove();
        else rooms.push(name);
    }

    localStorage.setItem("rooms", JSON.stringify(rooms));
};

const putMessage = (sender, content) => {
    const atBottom = messageContainer.scrollHeight - messageContainer.clientHeight
        <= messageContainer.scrollTop + 50;

    if (sender.length === 0) {
        const message = element("div", "message");
        message.append(
            element("span", ""),
            element("span", ""),
            element("span", "server-content", content)
        );
        messageContainer.appendChild(message);

    }
    else {
        const message = element("div", "message");
        message.append(
            element("span", "sender", sender),
            document.createTextNode(": "),
            element("span", "content", content)
        );
        messageContainer.appendChild(message);
    }

    if (messageContainer.children.length > 1000)
        messageContainer.children[0].remove();

    if (atBottom)
        scrollToBottom();
};

const roomElements = new Map();
const roomMessages = new Map();
const roomUnreads = new Map();
let blurredUnreads = 0;
const notifications = new Map();

let isBlurred = false;
const updateTitle = () => {
    let unreads = 0;
    for (const n of roomUnreads.values())
        unreads += n;

    if (unreads === 0)
        document.title = "Class Chat";
    else document.title = `(${unreads}) Class Chat`;
};

document.addEventListener("visibilitychange", () => {
    if (document.hidden) isBlurred = true;

    else {
        isBlurred = false;
        roomUnreads.set(selectedRoom, 0);
        updateTitle();
        notifications.forEach((n) => n.close());
        notifications.clear();
        blurredUnreads = 0;
    }
});

let selectedRoom = null;
const selectRoom = (room) => {
    if (selectedRoom !== null)
        roomElements.get(selectedRoom).classList.remove("selected");
    selectedRoom = room;
    messageContainer.innerHTML = "";
    const data = roomMessages.get(room);
    data.forEach(msg => putMessage(msg[0], msg[1]));
    roomElements.get(room).classList.add("selected");
};

/**
 * @type {WebSocket}
 */
let socket;
const createSocket = () => {
    try {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        socket = new WebSocket(`${protocol}://${window.location.host}/chat`);
    }
    catch (e) {
        console.log("Error connecting to websocket server!");
        setTimeout(createSocket, 1000);
        return;
    }

    socket.addEventListener("open", () => {
        indicator.className = "online";
        indicator.title = "Connected";
        socket.send(`N${localStorage.getItem("name")}`);
        
        const roomJoinListener = async (data) => {
            if (data.data.charAt(0) !== "N") return;

            roomContainer.innerHTML = "";
            const rooms = JSON.parse(localStorage.getItem("rooms"));
            for (let i = 0; i < rooms.length; i++) {
                const msg = `J${rooms[i]}`;
                socket.send(msg);
                await new Promise((res, rej) => {
                    socket.addEventListener("message", (data) => {
                        if (data.data === msg) res();
                    });
                    socket.addEventListener("close", rej);
                });
            }
            selectRoom(rooms[0]);
            roomElements.get(rooms[0]).classList.remove("unread");

            socket.removeEventListener("message", roomJoinListener);
        };

        socket.addEventListener("message", roomJoinListener);
    });

    socket.addEventListener("close", () => {
        indicator.className = "offline";
        indicator.title = "Disconnected";
        setTimeout(createSocket, 1000);
    });

    socket.addEventListener("message", (data) => {
        const msg = data.data;
        
        const type = msg.charAt(0);
        const content = msg.slice(1);
        if (type === "N") {
            nameButton.textContent = content;
            localStorage.setItem("name", content);
        }
        if (type === "F") {
            alert("That display name is currently taken!");
        }
        else if (type === "J") {
            const tab = element("div", "bar-tile room");
            tab.addEventListener("click", () => {
                selectRoom(content);
                tab.classList.remove("unread");
                if (roomUnreads.get(content) > 0) {
                    roomUnreads.set(content, 0);
                    updateTitle();
                }
            });

            const exitButton = element("button", "exit-room", "X");
            exitButton.addEventListener("click", (e) => {
                e.stopPropagation();
                if (roomContainer.children.length > 1) socket.send(`L${content}`);
            });

            tab.append(element("span", "room-name", content), exitButton);
            roomElements.set(content, tab);
            roomContainer.appendChild(tab);
            if (!roomMessages.has(content))
                roomMessages.set(content, []);
            roomUnreads.set(content, 0);

            updateRoomStorage();
        }
        else if (type === "L") {
            roomElements.get(content).remove();
            roomElements.delete(content);
            roomUnreads.delete(content);
            selectedRoom = null;
            //roomMessages.delete(content);
            updateTitle();
            updateRoomStorage(content);
        }
        else if (type === "M") {
            const data = content.split("\t");
            const msgContent = data.slice(2).join("\t");

            const msgsArr = roomMessages.get(data[0]);
            msgsArr.push([data[1], msgContent]);

            if (data[0] === selectedRoom) putMessage(data[1], msgContent);
            else roomElements.get(data[0]).classList.add("unread");

            if (data[0] !== selectedRoom || isBlurred) {
                roomUnreads.set(data[0], roomUnreads.get(data[0]) + 1);
                updateTitle();

                if (isBlurred && Notification.permission === "granted" && blurredUnreads < 5) {
                    notifications.get(data[1])?.close();

                    const notification = new Notification("Class Chat", {
                        body: `New message in ${data[1]}: ${msgContent}`
                    });

                    notification.addEventListener("click", () => {
                        window.focus();
                        scrollToBottom();
                    });

                    setTimeout(() => {
                        notification.close();
                        notifications.delete(notification);
                    }, 8000);

                    notifications.set(data[1], notification);
                    blurredUnreads += 1;
                }
            }
            if (msgsArr.length > 1000)
                msgsArr.shift();
        }

    });
};
createSocket();

// ui

const dialog = (message, _default) => {
    const res = prompt(message, _default);
    return res === null ? "" : res;
};

const isConnected = () => new Promise(res => {
    socket.send("P");
    const listener = (data) => {
        if (data.data === "P") {
            res(true);
            socket.removeEventListener("message", listener);
            socket.removeEventListener("close", closeListener);
        }
    };
    const closeListener = () => {
        res(false);
        socket.removeEventListener("message", listener);
        socket.removeEventListener("close", closeListener);
    };
    socket.addEventListener("message", listener);
    socket.addEventListener("close", closeListener);
    setTimeout(() => {
        res(false);
        socket.removeEventListener("message", listener);
        socket.removeEventListener("close", closeListener);
    }, 5000);
});

const strToHTML = (str) => {
    const e = document.createElement("span");
    e.textContent = str;
    return e.innerHTML;
};
downloadButton.addEventListener("click", () => {
    if (selectedRoom === null) return;

    const messages = roomMessages.get(selectedRoom);
    const date = new Date();

    let data = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${selectedRoom} - ` +
        date.toLocaleString("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "2-digit",
        }) +
        "</title><style>body{white-space:pre-wrap;overflow-wrap:break-word;font-size:20px;}.s{font-weight:bold;}.e{font-style:italic;color:#555;}</style></head><body>";

    messages.forEach(msg => {
        data += "<div>";
        if (msg[0].length === 0)
            data += `<span class="e">${strToHTML(msg[1])}</span>`;
        else data += `<span class="s">${strToHTML(msg[0])}</span>: <span>${msg[1]}</span>`;
        data += "</div>";
    });

    data += "</body></html>";
    
    const dateStr = date.toLocaleString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).replace(",", " ");

    const a = document.createElement("a");
    a.href = `data:text/html;charset=utf-8,${encodeURIComponent(data)}`;
    a.download = `${selectedRoom}-${dateStr}.html`;
    a.click();
});

roomButton.addEventListener("click", async () => {
    if (await isConnected()) {
        const name = dialog("Enter a room name:").trim();
        if (name.length > 16 || name.length === 0)
            alert("Input name has an invalid length!");
        else socket.send(`J${name}`);
    }
});

nameButton.addEventListener("click", async () => {
    if (await isConnected()) {
        const name = dialog("Enter a new display name:",
            roomElements.size === 0 ? null : nameButton.textContent).trim();
        
        if (name.length > 16 || name.length === 0)
            alert("Input name has an invalid length!");
        else socket.send(`N${name}`);
    }
});

const send = async () => {
    if (await isConnected()) {
        const text = inputBar.textContent.trim();
        inputBar.innerHTML = "<br>";
        if (text.length === 0) return;
        socket.send(`M${selectedRoom}\t${text}`);

        scrollToBottom();
    }
};

sendButton.addEventListener("click", send);
inputBar.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});
inputBar.addEventListener("beforeinput", (e) => {
    if (e.data?.length > 0 && inputBar.textContent.length >= 2048)
        e.preventDefault();
});

// force paste to only add plain text
inputBar.addEventListener("paste", (e) => {
    e.preventDefault();

    const text = e.clipboardData.getData("text/plain").slice(0, 2048 - inputBar.textContent.length);
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;
    selection.deleteFromDocument();
    selection.getRangeAt(0).insertNode(document.createTextNode(text));
    selection.collapseToEnd();
});

if (Notification.permission === "default")
    Notification.requestPermission();