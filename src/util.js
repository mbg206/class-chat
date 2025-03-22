import { CONTROL_BYTE } from "./shared/shared-util.js";
import { MessageStyle, MessageType } from "./shared/types.js";

export const createStringBuffer = (type, text) => {
    const data = Buffer.alloc(Buffer.byteLength(text) + 1);
    data.writeUInt8(type);
    data.write(text, 1);
    return data;
};

export const createMessageBuffer = (room, components) => {
    let size = 1 + Buffer.byteLength(room);
    let i = size;
    components.forEach(c => {
        c.content = c.content || "";
        size += 2 + Buffer.byteLength(c.content);
    });
    const data = Buffer.alloc(size);

    data.writeUInt8(MessageType.RECEIVE_MESSAGE);
    data.write(room, 1);

    components.forEach(c => {
        data.writeUInt8(CONTROL_BYTE, i);
        data.writeUInt8(c.style, i + 1);
        data.write(c.content, i + 2);
        i += 2 + c.content.length;
    });

    return data;
};

export const createServerMessageBuffer = (room, components) => {
    if (typeof components === "string")
        components = [{style: MessageStyle.SERVER, content: components}];

    else components.forEach(c => c.style = c.style | MessageStyle.SERVER);

    return createMessageBuffer(room, components);
};