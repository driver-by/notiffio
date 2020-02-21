const {GOODGAME_SERVICE_NAME, GoodgameService} = require('../services/goodgame');

const process = function(command, msg, dataStorage) {
    switch (command.params[0]) {
        case 'list':
            return processList(command, msg, dataStorage);
        case 'remove':
            return processRemove(command, msg, dataStorage);
        default:
            return processSubscribe(command, msg, dataStorage);
    }
};

function processList(command, msg, dataStorage) {
    const server = dataStorage.serverGet(msg.guild.id);
    let map = {};
    let text = '';
    if (server && server.subscriptions) {
        server.subscriptions.forEach(sub => {
            map[sub.channelName] = map[sub.channelName] || [];
            map[sub.channelName].push(sub.name);
        });
        Object.keys(map)
            .forEach(channelName => {
                text += `#${channelName}\n    ` + map[channelName].join(',\n    ') + '\n';
            });
    }
    if (!text) {
        text = 'Нет оповещений';
    }
    msg.channel.send(text);

    return text;
}

function processRemove(command, msg, dataStorage) {
    const serverId = msg.guild.id;
    const channelId = msg.channel.id;
    const channelName = msg.channel.name;
    let text;

    switch (command.params[1]) {
        case 'all':
            text = `Удалены все оповещения со всех каналов на сервере`;
            dataStorage.subscriptionRemoveList(serverId);
            break;
        case 'channel':
            text = `Удалены все оповещения с текущего канала #${channelName}`;
            dataStorage.subscriptionRemoveList(serverId, channelId);
            break;
        default:
            text = `Удалены все оповещения с текущего канала #${channelName}`;
            dataStorage.subscriptionRemoveList(serverId, channelId);
    }

    msg.channel.send(text);

    return text;
}

function processSubscribe(command, msg, dataStorage) {
    const serverId = msg.guild.id;
    const channelId = msg.channel.id;
    const channelName = msg.channel.name;
    const subscribeTo = getServiceInfo(command.params[0]);
    let text;
    if (subscribeTo && subscribeTo.channel) {
        const subscriptionName = dataStorage.getSubscriptionName(subscribeTo.service, subscribeTo.channel);
        const isSubscribed = dataStorage.isSubscribed(serverId, channelId, subscriptionName);
        if (isSubscribed) {
            dataStorage.subscriptionRemove(serverId, channelId, subscribeTo.service, subscribeTo.channel);
            text = `Отписались от канала ${subscribeTo.channel} (${subscribeTo.service}).`;
        } else {
            dataStorage.subscriptionAdd(serverId, channelId, channelName, subscribeTo.service, subscribeTo.channel);
            text = `Успешно подписались на канал ${subscribeTo.channel} (${subscribeTo.service}).` +
              ` Вы получите оповещение, когда стрим начнется`;
        }
    } else {
        text = `Неправильный формат или вебсайт. Попробуйте \`!notify {URL канала}\` (Поддерживаемые вебсайты: goodgame.ru)`;
    }
    msg.channel.send(text);

    return text;
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
        case 'goodgame.ru':
            channel = param2;
            break;
    }
    if (!channel) {
        return null;
    }

    return {service, channel};
}

module.exports = process;
