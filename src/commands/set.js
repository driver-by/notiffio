const helper = require('../services/helper');

const process = function(command, msg, dataStorage) {
    let text;
    if (command.params.length) {
        switch (command.params[0]) {
            case dataStorage.SETTING_STREAM_START_MESSAGE:
                let result;
                let setTextTo;
                if (command.params[1].startsWith('http')) {
                    setTextTo = command.params.slice(2).join(' ');
                    const channel = helper.getServiceInfo(command.params[1]);
                    const subscriptionName = dataStorage.getSubscriptionName(
                        channel.service,
                        channel.channel,
                    );
                    result = dataStorage.updateSettingMessageStreamStart(
                        msg.guild.id,
                        setTextTo,
                        subscriptionName,
                    );
                } else {
                    setTextTo = command.params.slice(1).join(' ');
                    result = dataStorage.updateSettingMessageStreamStart(
                        msg.guild.id,
                        setTextTo,
                    );
                }
                if (result === setTextTo) {
                    // Success
                    text = `Настройка сохранена`;
                } else {
                    text = `Не удалось сохранить, проверьте название канала`;
                }
                break;
        }
    } else {
        text = `Доступные команды:\n` +
            `**!notify set ${dataStorage.SETTING_STREAM_START_MESSAGE} ` +
            `Стрим на канале {channel} начался** - ` +
            `устанавливает собщение для оповещения о начале стрима ` +
            `({channel} в сообщении автоматически заменяется на название канала)\n\n` +
            `**!notify set ${dataStorage.SETTING_STREAM_START_MESSAGE} HTTP-АДРЕС-КАНАЛА ` +
            `Стрим на канале {channel} начался** - ` +
            `устанавливает собщение для оповещения о начале стрима конкретного канала. ` +
            `Замените HTTP-АДРЕС-КАНАЛА на реальный адрес канала` +
            `({channel} в сообщении автоматически заменяется на название канала)\n`;
    }

    msg.channel.send(text);

    return text;
};

module.exports = process;
