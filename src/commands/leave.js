const process = function(command, msg, dataStorage) {
    msg.channel.send(`Очень жаль расставаться, я буду скучать. Покидаю сервер`);
    msg.guild.leave();
};

module.exports = process;
