const axios = require('axios');
const logger = require('../logger').getLogger();
const helper = require('../services/helper');

const process = function(command, msg, dataStorage) {
    switch (command.main) {
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

    switch (command.params[0]) {
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
    const serverName = msg.guild.name;
    const channelId = msg.channel.id;
    const channelName = msg.channel.name;
    const subscribeTo = helper.getServiceInfo(command.main);
    let isSubscribed;
    let text;
    if (subscribeTo && subscribeTo.channel) {
        const subscriptionName = dataStorage.getSubscriptionName(subscribeTo.service, subscribeTo.channel);
        isSubscribed = dataStorage.isSubscribed(serverId, channelId, subscriptionName);
        if (isSubscribed) {
            dataStorage.subscriptionRemove(serverId, channelId, subscribeTo.service, subscribeTo.channel);
            text = `Отписались от канала ${subscribeTo.channel} (${subscribeTo.service}).`;
        } else {
            text = `Успешно подписались на канал ${subscribeTo.channel} (${subscribeTo.service}).` +
              ` Вы получите оповещение, когда стрим начнется`;
        }
    } else {
        text = `Неправильный формат или вебсайт. Попробуйте \`!notify {URL канала}\` (Поддерживаемые вебсайты: goodgame.ru, twitch.tv)`;
    }
    msg.channel.send(text)
        .then(() => {
            // Subscribe only after successful message. Bot could miss permissions for a channel then no need to subscribe
            if (!isSubscribed) {
                dataStorage.subscriptionAdd(serverId, channelId, serverName, channelName, subscribeTo.service, subscribeTo.channel);
            }
        });

    return text;
}

module.exports = process;
