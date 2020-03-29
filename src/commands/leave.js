const process = function(command, msg, dataStorage) {
    const serverId = msg.guild.id;
    const text = `Очень жаль расставаться, я буду скучать. Покидаю сервер`;
    dataStorage.serverRemove(serverId);
    msg.channel.send(text);
    msg.guild.leave();

    return text;
};

module.exports = process;
