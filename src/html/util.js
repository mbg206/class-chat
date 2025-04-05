const parseStringBuffer = (data) => {
    return new TextDecoder().decode(data.slice(1));
};

const parseMessageBuffer = (data) => {
    const components = [];
    
    let i = data.indexOf(CONTROL_BYTE);
    const room = new TextDecoder().decode(data.slice(1, i));

    while (true) {
        const contentEnd = data.indexOf(CONTROL_BYTE, i + 2);

        const component = {style: data[i + 1]};
        if (component.style !== MessageStyle.NEWBLOCK) {
            const slice = contentEnd === -1 ?
                data.slice(i + 2) :
                data.slice(i + 2, contentEnd);

            component.content = new TextDecoder().decode(slice);
        }

        components.push(component);

        if (contentEnd === -1)
            break;
        i = contentEnd;
    }

    return [room, components];
};