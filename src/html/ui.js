const MAX_MESSAGES = 2000;

const element = (tag, className = null, text = null) => {
    const e = document.createElement(tag);
    if (className !== null)
        e.className = className;
    if (text !== null)
        e.textContent = text;
    return e;
};

const roomElements = new Map();
const roomMessages = new Map();
const roomUnreads = new Map();
let blurredUnreads = 0;
const notifications = new Map();

if (Notification.permission === "default")
    Notification.requestPermission();

window.onbeforeunload = () => true;

// themes

const themeSelect = document.getElementById("theme-select");
const existingTheme = localStorage.getItem("theme");
if (existingTheme !== null)
    themeSelect.value = existingTheme;

const setTheme = () => document.body.className = `theme-${themeSelect.value}`;
themeSelect.addEventListener("input", () => {
    localStorage.setItem("theme", themeSelect.value);
    setTheme();
});
setTheme();

// dialog

const dialogContainer = document.getElementById("dialog-window");
const dialogText = document.getElementById("dialog-text");
const dialogInput = document.getElementById("dialog-input");
const dialogClose = document.getElementById("dialog-close");
const dialogCancel = document.getElementById("dialog-cancel");

const showDialog = (text, closeText = "OK", input = false, defaultInput = "") => {
    dialogText.textContent = text;
    
    dialogCancel.style.visibility = input ? "visible" : "hidden";
    dialogContainer.style.display = "flex";

    if (input) {
        dialogInput.style.visibility = "visible";
        dialogInput.value = defaultInput;
        dialogInput.focus();
    }
    else {
        dialogInput.style.visibility = "hidden";
        dialogClose.focus();
    }

    dialogClose.textContent = closeText;

    return new Promise(res => {
        const clickListener = (e) => {
            let closed = false;

            if (e.target === dialogCancel) {
                res(null);
                closed = true;
            }
            else if (e.target === dialogClose) {
                closed = true;
                if (input) {
                    res(dialogInput.value);
                }
                else res();
            }

            if (closed) {
                dialogContainer.style.display = "none";
                dialogContainer.removeEventListener("click", clickListener);
            }
        };

        dialogContainer.addEventListener("click", clickListener);
    });
};

dialogInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        dialogClose.click();
    }
});

// rooms

const roomContainer = document.getElementById("rooms");

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

const addRoom = (room) => {
    const tab = element("div", "bar-tile room");
            
    tab.addEventListener("click", () => {
        selectRoom(room);
        tab.classList.remove("unread");
        if (roomUnreads.get(room) > 0) {
            roomUnreads.set(room, 0);
            updateTitle();
        }
    });

    const exitButton = element("button", "bar-tile exit-room", "\u00D7");

    tab.append(element("span", "room-name", room), exitButton);
    roomElements.set(room, tab);
    roomContainer.appendChild(tab);
    if (!roomMessages.has(room))
        roomMessages.set(room, []);
    roomUnreads.set(room, 0);

    updateRoomStorage();

    return exitButton;
};

let selectedRoom = null;
const selectRoom = (room) => {
    if (room === selectedRoom) return;

    if (selectedRoom !== null)
        roomElements.get(selectedRoom).classList.remove("selected");
    selectedRoom = room;
    messageContainer.innerHTML = "";
    displayedObjects.forEach(url => URL.revokeObjectURL(url));
    displayedObjects.clear();
    const messages = roomMessages.get(room);
    messages.forEach(components => putMessage(components));
    roomElements.get(room).classList.add("selected");
};

// messages

const messageContainer = document.getElementById("messages");

const scrollToBottom = () =>
    messageContainer.scrollTo({top: messageContainer.scrollHeight - messageContainer.clientHeight});

const displayedObjects = new Set();
const putMessage = (components) => {
    const atBottom = messageContainer.scrollHeight - messageContainer.clientHeight
        <= messageContainer.scrollTop + 50;

    const message = element("div", "message");
    
    let block = element("div");
    for (const component of components) {
        const { style } = component;
        if (style === MessageStyle.NEWBLOCK) {
            message.appendChild(block);
            block = element("div");
            continue;
        }
        else if (style === MessageStyle.IMAGE) {
            if (localFiles.has(component.content)) {
                const url = URL.createObjectURL(localFiles.get(component.content));
                const img = document.createElement("img");
                img.src = url;
                img.className = "image";
                block.appendChild(img);
                displayedObjects.add(url);
            }
            else block.appendChild(element("span", "", "(deleted image)"));
            continue;
        }

        const classes = [];
        if (style & MessageStyle.ITALIC)        classes.push("italic");
        if (style & MessageStyle.BOLD)          classes.push("bold");
        if (style & MessageStyle.UNDERLINE)     classes.push("underline");
        if (style & MessageStyle.STRIKETHROUGH) classes.push("strikethrough");
        if (style & MessageStyle.CODE)          classes.push("code");
        if (style & MessageStyle.SERVER)        classes.push("server");

        if (style & MessageStyle.LINK) {
            const anchor = element("a", classes.join(" "), component.content);
            const href = component.content;
            anchor.href = URL.canParse(href) ? href : `//${href}`;
            anchor.target = "_blank";
            block.appendChild(anchor);
        }

        else block.appendChild(
            element("span", classes.join(" "), component.content)
        );
    }
    message.appendChild(block);

    messageContainer.appendChild(message);

    if (messageContainer.children.length > MAX_MESSAGES)
        messageContainer.children[0].remove();

    if (atBottom)
        scrollToBottom();
};

const updateTitle = () => {
    let unreads = 0;
    for (const n of roomUnreads.values())
        unreads += n;

    if (unreads === 0)
        document.title = "Class Chat";
    else document.title = `(${unreads}) Class Chat`;
};

// message input

const inputBar = document.getElementById("input");
const sendButton = document.getElementById("send");

const isConnected = () => new Promise((res) => {
    if (socket.readyState !== WebSocket.OPEN) {
        res(false);
        return;
    }

    socket.send(new Uint8Array([MessageType.PING]));
    
    let timeout;
    const closeListener = (success) => {
        res(success);
        clearTimeout(timeout);
        socket.removeEventListener("message", listener);
        socket.removeEventListener("close", closeListener);
    };
    timeout = setTimeout(() => closeListener(false), 5000);
    
    const listener = (event) => {
        if (new Uint8Array(event.data)[0] === MessageType.PONG)
            closeListener(true);
    };

    socket.addEventListener("message", listener);
    socket.addEventListener("close", () => closeListener(false));
});

const send = async () => {
    if (selectedRoom === null) return;

    if (!await isConnected()) return;

    const text = inputBar.textContent.trim();
    inputBar.innerHTML = "<br>";
    if (text.length === 0) return;

    const roomBuf = new TextEncoder().encode(selectedRoom);
    const contentBuf = new TextEncoder().encode(text);
    const data = new Uint8Array(roomBuf.byteLength + contentBuf.byteLength + 2);
    data[0] = MessageType.SEND_MESSAGE;
    data.set(roomBuf, 1);
    data[1 + roomBuf.byteLength] = CONTROL_BYTE;
    data.set(contentBuf, 2 + roomBuf.byteLength);

    socket.send(data);

    socket.addEventListener("message", scrollToBottom, {once: true});
};

sendButton.addEventListener("click", send);

// https://stackoverflow.com/a/58883178
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
inputBar.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
        e.preventDefault();
        send();
    }
});

const fileUpload = document.createElement("input");
fileUpload.type = "file";
fileUpload.accept = "image/apng,image/avif,image/gif,image/jpeg,image/png,image/svg+xml,image/webp"; // "image/*,video/*,audio/*";
document.getElementById("upload").addEventListener("click", () => {
    if (selectedRoom === null) return;
    fileUpload.click();
});

fileUpload.addEventListener("change", async () => {
    if (fileUpload.files.length !== 1) return;
    
    if (selectedRoom === null) return;

    const file = fileUpload.files[0];
    if (file.size > 10e6) { // 10mb
        showDialog(`Files have a limit of 10mb! (You uploaded ${Math.ceil(file.size / 1e5) / 10}mb)`);
        return;
    }
    
    if (!await isConnected()) return;
    
    const bytes = await file.bytes();
    
    const roomBuf = new TextEncoder().encode(selectedRoom);
    const mimeBuf = new TextEncoder().encode(file.type);
    const data = new Uint8Array(bytes.byteLength + mimeBuf.byteLength + roomBuf.byteLength + 3);
    
    data[0] = MessageType.SEND_ATTACHMENT;
    data.set(roomBuf, 1);
    data[1 + roomBuf.byteLength] = CONTROL_BYTE;
    data.set(mimeBuf, 2 + roomBuf.byteLength);

    const dataStart = 2 + roomBuf.byteLength + mimeBuf.byteLength;
    data[dataStart] = CONTROL_BYTE;
    data.set(bytes, dataStart + 1);
    
    socket.send(data);

    socket.addEventListener("message", scrollToBottom, {once: true});
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

// visibility detection

let isBlurred = false;
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