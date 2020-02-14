const GoodgameService = require('../services/goodgame');

const process = function(command, msg, dataStorage) {
    switch (command.params[0]) {
        case 'list':
            processList(command, msg, dataStorage);
            break;
        default:
            processSubscribe(command, msg, dataStorage);
            break;
    }
};

function processList(command, msg, dataStorage) {
    const server = dataStorage.serverGet(msg.guild.id);
    let text = '';
    if (server && server.subscriptions) {
        text = server.subscriptions.join(',\n')
    }
    if (!msg) {
        text = 'Нет нотификаций';
    }
    msg.channel.send(text);
}

function processSubscribe(command, msg, dataStorage) {
    const serverId = msg.guild.id;
    const channelId = msg.channel.id;
    const channelName = msg.channel.name;
    const subscribeTo = getServiceInfo(command.params[0]);
    if (subscribeTo && subscribeTo.channel) {
        const subscriptionName = dataStorage.getSubscriptionName(subscribeTo.service, subscribeTo.channel);
        const isSubscribed = dataStorage.isSubscribed(serverId, channelId, subscriptionName);
        if (isSubscribed) {
            dataStorage.subscriptionRemove(serverId, channelId, subscribeTo.service, subscribeTo.channel);
            msg.channel.send(`Отписались от канала ${subscribeTo.channel} (${subscribeTo.service}).`);
        } else {
            dataStorage.subscriptionAdd(serverId, channelId, channelName, subscribeTo.service, subscribeTo.channel);
            msg.channel.send(`Успешно подписались на канал ${subscribeTo.channel} (${subscribeTo.service}).` +
              ` Вы получите оповещение, когда стрим начнется`);
        }
    } else {
        msg.channel.send(`Неправильный формат или вебсайт. Попробуй \`!notify {URL канала}\` (Поддерживаемые вебсайты: goodgame.ru)`);
    }
}

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
        case GoodgameService.name:
            channel = param2;
            break;
    }
    if (!channel) {
        return null;
    }

    return {service, channel};
}

module.exports = process;
