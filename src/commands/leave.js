const process = function(command, msg, dataStorage) {
    const serverId = msg.guild.id;
    const channelId = msg.channel.id;
    dataStorage.subscriptionRemoveList(serverId, channelId);
    msg.channel.send(`Очень жаль расставаться, я буду скучать. Покидаю сервер`);
    msg.guild.leave();
};

module.exports = process;
