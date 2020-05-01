const helper = require('../services/helper');

const DEFAULT_COMMAND = 'default';
const process = function(command, msg, dataStorage) {
    let text;
    if (command.params.length) {
        switch (command.params[0]) {
            case dataStorage.SETTING_STREAM_START_MESSAGE:
            case dataStorage.SETTING_STREAM_STOP_MESSAGE:
            case dataStorage.SETTING_STREAM_PROCEED_MESSAGE:
            case dataStorage.SETTING_ANNOUNCEMENT_ADD_MESSAGE:
            case dataStorage.SETTING_ANNOUNCEMENT_EDIT_MESSAGE:
            case dataStorage.SETTING_ANNOUNCEMENT_REMOVE_MESSAGE:
                const setting = command.params[0];
                let result;
                let setTextTo;
                if (command.params[1] && command.params[1].startsWith('http')) {
                    // Empty string by default means "don't sohw this notification"
                    setTextTo = command.params.slice(2).join(' ') || '';
                    const channel = helper.getServiceInfo(command.params[1]);
                    const subscriptionName = dataStorage.getSubscriptionName(
                        channel.service,
                        channel.channel,
                    );
                    if (setTextTo === DEFAULT_COMMAND) {
                        result = dataStorage.removeSettingMessage(
                            setting,
                            msg.guild.id,
                            subscriptionName,
                        );
                    } else {
                        result = dataStorage.updateSettingMessage(
                            setting,
                            msg.guild.id,
                            setTextTo,
                            subscriptionName,
                        );
                    }
                } else {
                    setTextTo = command.params.slice(1).join(' ');
                    if (setTextTo === DEFAULT_COMMAND) {
                        result = dataStorage.removeSettingMessage(
                            setting,
                            msg.guild.id,
                        );
                    } else {
                        result = dataStorage.updateSettingMessage(
                            setting,
                            msg.guild.id,
                            setTextTo,
                        );
                    }
                }
                if (setTextTo === DEFAULT_COMMAND) {
                    text = `Настройка выставлена по-умолчанию`;
                } else if (result === setTextTo) {
                    // Success
                    text = `Настройка сохранена`;
                } else {
                    text = `Не удалось сохранить, проверьте название канала`;
                }
                break;
            default:
                text = `Неверная команда, введите **!notify set** для просмотра помощи`;
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
            `Замените HTTP-АДРЕС-КАНАЛА на реальный адрес канала\n\n` +
            `**!notify set ${dataStorage.SETTING_STREAM_START_MESSAGE}** (пустой текст) - не выводить оповещение\n` +
            `**!notify set ${dataStorage.SETTING_STREAM_START_MESSAGE} default** - устанавливает опять значение по-умолчанию\n\n` +
            `*Все доступные настройки:*\n` +
            `**${dataStorage.SETTING_STREAM_START_MESSAGE}** - сообщение о начале стрима\n` +
            `**${dataStorage.SETTING_STREAM_STOP_MESSAGE}** - сообщение об окончании стрима\n` +
            `**${dataStorage.SETTING_STREAM_PROCEED_MESSAGE}** - сообщение о продолжении стрима\n` +
            `**${dataStorage.SETTING_ANNOUNCEMENT_ADD_MESSAGE}** - новый анонс\n` +
            `**${dataStorage.SETTING_ANNOUNCEMENT_EDIT_MESSAGE}** - изменение анонса\n` +
            `**${dataStorage.SETTING_ANNOUNCEMENT_REMOVE_MESSAGE}** - отмена анонса\n`;
    }

    msg.channel.send(text);

    return text;
};

module.exports = process;
