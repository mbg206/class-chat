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
const roomButton = document.getElementById("add-room");
const nameButton = document.getElementById("set-name");
const inputBar = document.getElementById("input");
const sendButton = document.getElementById("send");
const messageContainer = document.getElementById("messages");

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
        == messageContainer.scrollTop;

    if (sender === "")
        messageContainer.appendChild(element("div", "message server-content", content));
    else {
        const message = element("div", "message");
        message.append(
            element("span", "sender", sender),
            document.createTextNode(": "),
            element("span", "content", content)
        );
        messageContainer.appendChild(message);
    }

    if (messageContainer.children.length > 500)
        messageContainer.children[0].remove();

    if (atBottom)
        messageContainer.scrollTo({top: messageContainer.scrollHeight - messageContainer.clientHeight});
};

const roomElements = new Map();
let roomMessages = new Map();
const roomUnreads = new Map();

let isBlurred = false;
const updateTitle = () => {
    let unreads = 0;
    for (const n of roomUnreads.values())
        unreads += n;

    if (unreads === 0)
        document.title = "Class Chat";
    else document.title = `(${unreads}) Class Chat`;
};
window.addEventListener("blur", () => isBlurred = true);
window.addEventListener("focus", () => {
    isBlurred = false;
    roomUnreads.set(selectedRoom, 0);
    updateTitle();
});

let selectedRoom;
const selectRoom = (room) => {
    if (selectedRoom !== undefined)
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
            updateTitle();
            updateRoomStorage(content);
        }
        else if (type === "M") {
            const data = content.split("\t");
            const msgsArr = roomMessages.get(data[0]);
            msgsArr.push(data.slice(1));
            if (data[0] === selectedRoom) putMessage(data[1], data.slice(2).join("\t"));
            else roomElements.get(data[0]).classList.add("unread");

            if (data[0] !== selectedRoom || isBlurred) {
                roomUnreads.set(data[0], roomUnreads.get(data[0]) + 1);
                updateTitle();
            }
            if (msgsArr.length > 500)
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

roomButton.addEventListener("click", () => {
    if (socket.readyState === WebSocket.OPEN) {
        const name = dialog("Enter a room name:").trim();
        if (name.length > 16 || name.length === 0)
            alert("Input name has an invalid length!");
        else socket.send(`J${name}`);
    }
});

nameButton.addEventListener("click", () => {
    if (socket.readyState === WebSocket.OPEN) {
        const name = dialog("Enter a new display name:",
            roomElements.size === 0 ? null : nameButton.textContent).trim();
        
        if (name.length > 16 || name.length === 0)
            alert("Input name has an invalid length!");
        else socket.send(`N${name}`);
    }
});

const send = () => {
    if (socket.readyState === WebSocket.OPEN) {
        const text = inputBar.value.trim();
        inputBar.value = "";
        if (text.length === 0 || text.length > 2048) return;
        socket.send(`M${selectedRoom}\t${text}`);

        messageContainer.scrollTo({top: messageContainer.scrollHeight - messageContainer.clientHeight});
    }
};

sendButton.addEventListener("click", send);
inputBar.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
});