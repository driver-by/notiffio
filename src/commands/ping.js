const process = function(command, msg, dataStorage) {
    const text = `Pong!`;

    msg.reply(text);

    return text;
};

module.exports = process;
