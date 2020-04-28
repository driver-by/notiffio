
function getServiceInfo(url) {
    if (!url) {
        return null;
    }

    const match = url.match(/^(?:https?:\/\/)?(\w*\.\w*)\/([\w-_.]*)\/([\w-_.]*)\/?/i);
    if (!match) {
        return null;
    }
    const [m, service, param1, param2] = match;
    let channel;
    switch (service) {
        case 'goodgame.ru':
            channel = param2;
            break;
    }
    if (!channel) {
        return null;
    }

    return {service, channel};
}

module.exports = {
    getServiceInfo,
}
