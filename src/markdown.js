import { MessageStyle } from "./shared/types.js";

const MARKDOWN_REGEX = /(?:`(.+?)`)|(?:\*\*\*(.+?)\*\*\*)|(?:\*\*(.+?)\*\*)|(?:(?<!\\)\*(.*?[^\\])\*)|(?:__(.+?)__)|(?:~~(.+?)~~)/g;
const URL_REGEX = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/;

const parseMarkdownArr = (components) => {
    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        const parts = component.content.split(MARKDOWN_REGEX);

        if (parts.length === 1) {
            component.content = component.content.replace(/\\([\\`*_~])/g, "$1");
            continue;
        }

        if (component.style & MessageStyle.CODE) continue;

        components[i] = [];

        for (let k = 0; k < parts.length; k++) {
            const type = k % 7;
            if (typeof parts[k] !== "string") continue;

            components[i].push({style: component.style | [
                MessageStyle.PLAIN,
                MessageStyle.CODE,
                MessageStyle.BOLD | MessageStyle.ITALIC,
                MessageStyle.BOLD,
                MessageStyle.ITALIC,
                MessageStyle.UNDERLINE,
                MessageStyle.STRIKETHROUGH,
            ][type], content: parts[k]});
        }
    }
    
    for (let i = 0; i < components.length; i++) {
        if (components[i] instanceof Array)
            parseMarkdownArr(components[i]);
    }
};

export const parseMarkdown = (text) => {
    const components = [{style: MessageStyle.PLAIN, content: text}];
    parseMarkdownArr(components);

    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        if (component.style & MessageStyle.CODE) continue;
        
        const c = component.content;
        const url = URL_REGEX.exec(c);
        if (url === null) continue;

        const preURL = c.slice(0, url.index);
        const postURL = c.slice(url.index + url[0].length);

        components.splice(i, 1, {
            style: component.style,
            content: preURL
        }, {
            style: component.style | MessageStyle.LINK,
            content: url[0]
        }, {
            style: component.style,
            content: postURL
        });

        i += 2;
    }

    return components.flat(Infinity);
};