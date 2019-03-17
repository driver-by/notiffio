const process = function(command, msg, dataStorage) {
    // switch (command.params[0]) {
    //     case 'list':
    // }
    const serverId = msg.guild.id;
    const subscribeTo = getServiceInfo(command.params[0]);
    if (subscribeTo && subscribeTo.channel) {
        const server = dataStorage.serverGet(serverId);
        let alreadySubscribed = false;
        if (server && server.subscriptions) {
            const subIndex = server.subscriptions.findIndex(value => {
                return value.service === subscribeTo.service &&
                    value.channel === subscribeTo.channel;
            });
            if (subIndex !== -1) {
                alreadySubscribed = true;
            }
        }
        if (alreadySubscribed) {
            dataStorage.subscriptionRemove(serverId, subscribeTo.service, subscribeTo.channel);
            msg.channel.send(`Unsubscribed from ${subscribeTo.channel} (${subscribeTo.service}).`);
        } else {
            dataStorage.subscriptionAdd(serverId, subscribeTo.service, subscribeTo.channel);
            msg.channel.send(`Subscribed to ${subscribeTo.channel} (${subscribeTo.service}).` +
                ` You'll get notification when stream starts`);
        }
    } else {
        msg.channel.send(`Wrong format or website. Try \`!notify {channel URL}\``);
    }
};

function getServiceInfo(url) {
    if (!url) {
        return null;
    }

    const match = url.match(/^(?:https?:\/\/)?(\w*)\.(?:\w*)\/([\w-_.]*)\/([\w-_.]*)\/?/i);
    if (!match) {
        return null;
    }
    const [m, service, param1, param2] = match;
    let channel;
    switch (service) {
        case 'goodgame':
            channel = param2;
            break;
    }
    if (!channel) {
        return null;
    }

    return {service, channel};
}

module.exports = process;