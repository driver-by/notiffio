const helper = require('../services/helper');

const DEFAULT_COMMAND = 'default';
const process = function(command, msg, dataStorage) {
    let text;
    if (command.params.length) {
        const setting = command.params[0];
        switch (setting) {
            case dataStorage.SETTING_STREAM_START_MESSAGE:
            case dataStorage.SETTING_STREAM_STOP_MESSAGE:
            case dataStorage.SETTING_STREAM_PROCEED_MESSAGE:
            case dataStorage.SETTING_ANNOUNCEMENT_ADD_MESSAGE:
            case dataStorage.SETTING_ANNOUNCEMENT_EDIT_MESSAGE:
            case dataStorage.SETTING_ANNOUNCEMENT_REMOVE_MESSAGE:
                let result;
                let setTextTo;
                if (command.params[1] && command.params[1].startsWith('http')) {
                    // Empty string by default means "don't show this notification"
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
                    if (setTextTo === '') {
                        text = `Сообщение больше показываться не будет (передан пустой текст)`;
                    } else {
                        text = `Настройка сохранена`;
                    }
                } else {
                    text = `Не удалось сохранить, проверьте название канала`;
                }
                break;
            case dataStorage.SETTING_EMBED_REMOVE:
                dataStorage.updateSettingMessage(
                    setting,
                    msg.guild.id,
                    true,
                );
                text = `Embed сообщения отключены`;
                break;
            case dataStorage.SETTING_EMBED_ALLOW:
                dataStorage.removeSettingMessage(
                    dataStorage.SETTING_EMBED_REMOVE,
                    msg.guild.id,
                );
                text = `Embed сообщения включены`;
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
            `**!notify set ${dataStorage.SETTING_STREAM_START_MESSAGE}** - не выводить оповещение (т.е. передается пустой текст)\n` +
            `**!notify set ${dataStorage.SETTING_STREAM_START_MESSAGE} default** - устанавливает значение по-умолчанию\n\n` +
            `*Все доступные настройки:*\n` +
            `**${dataStorage.SETTING_STREAM_START_MESSAGE}** - сообщение о начале стрима\n` +
            `**${dataStorage.SETTING_STREAM_STOP_MESSAGE}** - сообщение об окончании стрима\n` +
            `**${dataStorage.SETTING_STREAM_PROCEED_MESSAGE}** - сообщение о продолжении стрима\n` +
            `**${dataStorage.SETTING_ANNOUNCEMENT_ADD_MESSAGE}** - новый анонс\n` +
            `**${dataStorage.SETTING_ANNOUNCEMENT_EDIT_MESSAGE}** - изменение анонса\n` +
            `**${dataStorage.SETTING_ANNOUNCEMENT_REMOVE_MESSAGE}** - отмена анонса\n\n` +
            `Другие настройки:\n` +
            `**!notify set ${dataStorage.SETTING_EMBED_REMOVE}** - отменить использование Embed сообщений\n` +
            `**!notify set ${dataStorage.SETTING_EMBED_ALLOW}** - разрешить использование Embed сообщений` +
            `Другие "магические" строки кроме {channel}, заменяющиеся в сообщении:\n` +
            `**{channel}** - название канала\n` +
            `**{url}** - URL канала\n` +
            `**{game}** - игра на стриме\n` +
            `**{title}** - название стрима\n` +
            `**{broadcast-start}** - время начала трансляции в анонсе (только для анонсов)\n` +
            `**{broadcast-title** - название анонса (только для анонсов)\n` +
            `**{broadcast-game}** - игра в анонсе (только для анонсов)\n`;
    }

    msg.channel.send(text);

    return text;
};

module.exports = process;
