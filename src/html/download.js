const KEPT_RULES = [
    "*", "body", ".bar",
    ".bar-tile", "#messages",
    "#messages > :first-child",
    ".message", ".message > *",
    ".bold", ".italic",
    ".underline", ".strikethrough",
    ".code", ".underline.strikethrough",
    ".server", ".image"
];

const downloadButton = document.getElementById("dl-log");

const strToHTML = (str) => {
    const e = document.createElement("span");
    e.textContent = str;
    return e.innerHTML;
};
downloadButton.addEventListener("click", async () => {
    if (selectedRoom === null) return;

    const mainSheet = document.styleSheets[0].cssRules;
    let styleText = "";
    for (const rule of mainSheet) {
        if (!KEPT_RULES.includes(rule.selectorText)) continue;

        styleText += rule.cssText;
    }

    styleText.replace("cursor: pointer;", "");

    const themeSheet = document.styleSheets[2].cssRules;
    const theme = themeSelect.value;
    const keptRules = KEPT_RULES.map(r => `.theme-${theme} ${r}`);
    for (const rule of themeSheet) {
        if (
            rule.selectorText !== `.theme-${theme}` &&
            !keptRules.includes(rule.selectorText)
        ) continue;

        styleText += rule.cssText;
    }

    const date = new Date();

    const dateStr = date.toLocaleString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).replace(",", " ");

    const messages = messageContainer.cloneNode(true);
    for (const image of messages.getElementsByTagName("img")) {
        try {
            const res = await fetch(image.src);
            const buf = await res.arrayBuffer();
            image.src = "data:image/webp;base64," + btoa(String.fromCharCode(...new Uint8Array(buf)));
        }
        catch (e) {
            image.removeAttribute("src");
            image.alt = "(deleted image)";
        }
    }

    let data = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">" +
                `<title>${selectedRoom} - ` +
                date.toLocaleString("en-US", {
                    month: "2-digit",
                    day: "2-digit",
                    year: "2-digit",
                }) +
                `</title><style>${styleText}</style></head><body class="theme-${theme}"><div class="bar"><div class="bar-tile">${selectedRoom} - ${dateStr}` +
                `</div></div><div id=\"messages\">${messages.innerHTML}</div></body></html>`;

    const a = document.createElement("a");
    a.href = `data:text/html;charset=utf-8,${encodeURIComponent(data)}`;
    a.download = `${selectedRoom}-${dateStr}.html`;
    a.click();
});