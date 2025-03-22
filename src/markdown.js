import { MessageStyle } from "./shared/types.js";

const MARKDOWN_REGEX = /(?:`(.+?)`)|(?:\*\*\*(.+?)\*\*\*)|(?:\*\*(.+?)\*\*)|(?:(?<!\\)\*(.*?[^\\])\*)|(?:__(.+?)__)|(?:~~(.+?)~~)/g;

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

    // remove escaped characters
    return components.flat(Infinity);
};