export const MIME_TYPES = {
    "html": "text/html",
    "css": "text/css",
    "js": "text/javascript",
    "woff": "font/woff",
    "ttf": "font/ttf"
};

export const MessageType = {
    // server
    PING: 0,
    PONG: 1,
    REQUEST_NAME: 2,
    REQUEST_JOIN_ROOM: 3,
    REQUEST_LEAVE_ROOM: 4,
    SEND_MESSAGE: 5,
    
    // client
    SET_NAME: 2,
    NAME_FAILURE: 3,
    JOIN_ROOM: 4,
    LEAVE_ROOM: 5,
    RECEIVE_MESSAGE: 6,
    RECEIVE_ATTACHMENT: 6,
};

export const AttachmentType = {
    IMAGE: 0,
    AUDIO: 1,
    VIDEO: 2
};

export const MessageStyle = {
    // inline
    PLAIN: 0,
    BOLD: 2**0,
    ITALIC: 2**1,
    UNDERLINE: 2**2,
    STRIKETHROUGH: 2**3,
    CODE: 2**4,
    SERVER: 2**5,

    NEWBLOCK: 2**6
};