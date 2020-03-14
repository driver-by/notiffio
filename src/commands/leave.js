const process = function(command, msg, dataStorage) {
    const serverId = msg.guild.id;
    dataStorage.serverRemove(serverId);
    msg.channel.send(`Очень жаль расставаться, я буду скучать. Покидаю сервер`);
    msg.guild.leave();
};

module.exports = process;
