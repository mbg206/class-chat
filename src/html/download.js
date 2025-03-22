const downloadButton = document.getElementById("dl-log");

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