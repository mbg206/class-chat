if (localStorage.getItem("name") === null) {
    localStorage.setItem("name", `user-${Math.floor(Math.random() * 8999) + 1000}`);
    localStorage.setItem("rooms", "[\"general\"]");
}

const createStringBuffer = (type, text) => {
    const textBuf = new TextEncoder().encode(text);
    const data = new Uint8Array(textBuf.byteLength + 1);
    data[0] = type;
    data.set(textBuf, 1);
    return data;
};

const indicator = document.getElementById("connection-indicator");
const setIndicator = (status) => {
    if (status === WebSocket.OPEN) {
        indicator.className = "online";
        indicator.title = "Connected";
    }
    else if (status === WebSocket.CLOSED) {
        indicator.className = "offline";
        indicator.title = "Disconnected";
    }
    else {
        indicator.className = "connecting";
        indicator.title = "Connecting...";
    }
};

const showNotification = (room, content) => {
    if (room !== selectedRoom || isBlurred) {
        roomUnreads.set(room, roomUnreads.get(room) + 1);
        updateTitle();

        if (isBlurred && Notification.permission === "granted") { // && blurredUnreads < 5) {
            notifications.get(room)?.close();

            const notification = new Notification("Class Chat", {
                body: content, silent: true
            });

            notification.addEventListener("click", () => {
                window.focus();
                scrollToBottom();
            });

            setTimeout(() => {
                notification.close();
                notifications.delete(notification);
            }, 10000);

            notifications.set(room, notification);
            blurredUnreads += 1;
        }
    }
};

const localFiles = new Map();

let socket;
const createSocket = () => {
    try {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        socket = new WebSocket(`${protocol}://${window.location.host}/chat`);
        socket.binaryType = "arraybuffer";
    }
    catch (e) {
        console.log("Error connecting to websocket server!");
        console.error(e);
        setTimeout(createSocket, 1000);
        return;
    }

    socket.addEventListener("open", () => {
        roomContainer.innerHTML = "";
        setIndicator(WebSocket.OPEN);
        socket.send(createStringBuffer(MessageType.REQUEST_NAME, localStorage.getItem("name")));
    });

    const initListener = (event) => {
        const type = new Uint8Array(event.data)[0];
        if (type === MessageType.SET_NAME) {
            socket.removeEventListener("message", initListener);

            const rooms = JSON.parse(localStorage.getItem("rooms"));

            rooms.forEach((r) => socket.send(createStringBuffer(MessageType.REQUEST_JOIN_ROOM, r)));
        }
    };
    socket.addEventListener("message", initListener);
    
    let socketInterval = setInterval(() => setIndicator(socket.readyState), 1000);

    socket.addEventListener("close", () => {
        setIndicator(WebSocket.CLOSED);
        clearInterval(socketInterval);
        setTimeout(createSocket, 1000);
    });

    socket.addEventListener("message", (event) => {
        const data = new Uint8Array(event.data);
        const type = data[0];
        
        if (type === MessageType.SET_NAME) {
            const name = parseStringBuffer(data);
            nameButton.textContent = name;
            localStorage.setItem("name", name);
        }

        else if (type === MessageType.NAME_FAILURE) {
            showDialog("That display name is currently taken!");
        }

        else if (type === MessageType.JOIN_ROOM) {
            const room = parseStringBuffer(data);
            const exitButton = addRoom(room);
            
            exitButton.addEventListener("click", (e) => {
                e.stopPropagation();
                if (roomContainer.children.length > 1)
                    socket.send(createStringBuffer(MessageType.REQUEST_LEAVE_ROOM, room));
            });

            if (selectedRoom === null)
                selectRoom(room);
        }

        else if (type === MessageType.LEAVE_ROOM) {
            const room = parseStringBuffer(data);
            roomElements.get(room).remove();
            roomElements.delete(room);
            roomUnreads.delete(room);
            if (selectedRoom === room) selectedRoom = null;
            //roomMessages.delete(room);
            updateTitle();
            updateRoomStorage(room);
        }

        else if (type === MessageType.RECEIVE_MESSAGE) {
            const [room, components] = parseMessageBuffer(data);

            const msgsArr = roomMessages.get(room);
            msgsArr.push(components);

            if (room === selectedRoom) putMessage(components);
            else roomElements.get(room).classList.add("unread");

            const notificationContent = components.reduce((pv, cv) => pv + cv.content, "");
            showNotification(room, `\uD83D\uDD14 New message in ${room}\n\n${notificationContent}`);

            if (msgsArr.length > MAX_MESSAGES)
                msgsArr.shift();
        }

        else if (type === MessageType.RECEIVE_ATTACHMENT) {
            const nameEnd = data.indexOf(CONTROL_BYTE);
            const sender = new TextDecoder().decode(data.slice(1, nameEnd));

            const roomEnd = data.indexOf(CONTROL_BYTE, nameEnd + 1);
            const room = new TextDecoder().decode(data.slice(nameEnd + 1, roomEnd));

            const image = new Blob([data.slice(roomEnd + 1)], {type: "image/webp"});
            const uuid = Math.random() * 1e10;
            
            localFiles.set(uuid, image);
            if (localFiles.size > 15) localFiles.delete(localFiles.keys().next().value);

            const components = [
                {style: MessageStyle.SENDER | MessageStyle.BOLD, content: sender},
                {style: MessageStyle.SENDER, content: ": "},
                {style: MessageStyle.NEWBLOCK},
                {style: MessageStyle.IMAGE, content: uuid}
            ];

            const msgsArr = roomMessages.get(room);
            msgsArr.push(components);

            if (room === selectedRoom) putMessage(components);
            else roomElements.get(room).classList.add("unread");

            showNotification(room, `\uD83D\uDD14 New message in ${room}\n\n(Image)`);

            if (msgsArr.length > MAX_MESSAGES)
                msgsArr.shift();
        }
    });
};
createSocket();

// config buttons

const roomButton = document.getElementById("add-room");
const nameButton = document.getElementById("set-name");

roomButton.addEventListener("click", async () => {
    if (await isConnected()) {
        const name = (await showDialog("Enter a room name:", "Join", true)).trim();
        if (!validateName(name))
            showDialog("Input name is invalid!");
        else socket.send(createStringBuffer(MessageType.REQUEST_JOIN_ROOM, name));
    }
});

nameButton.addEventListener("click", async () => {
    if (await isConnected()) {
        const name = (await showDialog("Enter a new display name:", "Set", true,
            roomElements.size === 0 ? null : nameButton.textContent)).trim();
        
        if (!validateName(name))
            showDialog("Input name is invalid!");
        else socket.send(createStringBuffer(MessageType.REQUEST_NAME, name));
    }
});