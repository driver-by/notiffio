const process = function(command, msg, dataStorage) {
    const text = `Список доступных команд:\n` +
        `**!notify help** - помощь по командам\n` +
        `**!notify {ссылка на канал}** - добавить оповещение или удалить, если канал уже добавлен\n` +
        `**!notify list** - список всех добавленных оповещений\n` +
        `**!notify remove** - удалить оповещения с канала\n` +
        `**!notify remove all** - удалить оповещения по всему серверу\n` +
        `**!notify leave** - выгнать бота с сервера\n`;

    msg.channel.send(text);

    return text;
};

module.exports = process;
