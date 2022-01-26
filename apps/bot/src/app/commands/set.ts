import { getServiceInfo } from '../services/helper';
import { DataAccess } from '../../../../../libs/data-access/src';
import { SettingName } from '../../../../../libs/data-access/src/lib/setting-name';

const DEFAULT_COMMAND = 'default';
const removeFirstWord = (text) => {
  if (!text) {
    return '';
  }
  const index = text.indexOf(' ');
  if (index === -1) {
    return '';
  }
  return text.substr(index + 1);
};

export default async function set(command, msg, dataAccess: DataAccess) {
  let text;
  if (command.params.length) {
    const setting = command.params[0];
    switch (setting) {
      case SettingName.StreamStart:
      case SettingName.StreamStop:
      case SettingName.StreamProceed:
      case SettingName.AnnouncementAdd:
      case SettingName.AnnouncementEdit:
      case SettingName.AnnouncementRemove:
        let result;
        let setTextTo;
        if (command.params[1] && command.params[1].startsWith('http')) {
          // Empty string by default means "don't show this notification"
          setTextTo = removeFirstWord(
            removeFirstWord(removeFirstWord(command.text))
          );
          const channel = getServiceInfo(command.params[1]);
          const subscriptionName = dataAccess.getSubscriptionName(
            channel.service,
            channel.channel
          );
          if (setTextTo === DEFAULT_COMMAND) {
            result = await dataAccess.removeSettingMessage(
              setting,
              msg.guild.id,
              subscriptionName
            );
          } else {
            result = await dataAccess.updateSettingMessage(
              setting,
              msg.guild.id,
              setTextTo,
              subscriptionName
            );
          }
        } else {
          setTextTo = removeFirstWord(removeFirstWord(command.text));
          if (setTextTo === DEFAULT_COMMAND) {
            result = await dataAccess.removeSettingMessage(
              setting,
              msg.guild.id
            );
          } else {
            result = await dataAccess.updateSettingMessage(
              setting,
              msg.guild.id,
              setTextTo
            );
          }
        }
        if (setTextTo === DEFAULT_COMMAND) {
          text = `Настройка выставлена по-умолчанию`;
        } else if (result.modifiedCount > 0) {
          if (setTextTo === '') {
            text = `Сообщение больше показываться не будет (передан пустой текст)`;
          } else {
            text = `Настройка сохранена`;
          }
        } else {
          text = `Не удалось сохранить, проверьте название канала`;
        }
        break;
      case SettingName.EmbedRemove:
        await dataAccess.updateSettingMessage(setting, msg.guild.id, true);
        text = `Embed сообщения отключены`;
        break;
      case SettingName.EmbedAllow:
        await dataAccess.removeSettingMessage(
          SettingName.EmbedRemove,
          msg.guild.id
        );
        text = `Embed сообщения включены`;
        break;
      default:
        text = `Неверная команда, введите **!notify set** для просмотра помощи`;
    }
  } else {
    text =
      `Доступные команды:\n` +
      `**!notify set ${SettingName.StreamStart} ` +
      `Стрим на канале {channel} начался** - ` +
      `устанавливает собщение для оповещения о начале стрима ` +
      `({channel} в сообщении автоматически заменяется на название канала, см. другие магические строки в конце)\n\n` +
      `**!notify set ${SettingName.StreamStart} HTTP-АДРЕС-КАНАЛА ` +
      `Стрим на канале {channel} начался** - ` +
      `устанавливает собщение для оповещения о начале стрима конкретного канала. ` +
      `Замените HTTP-АДРЕС-КАНАЛА на реальный адрес канала\n\n` +
      `**!notify set ${SettingName.StreamStart}** - не выводить оповещение (т.е. передается пустой текст)\n` +
      `**!notify set ${SettingName.StreamStart} default** - устанавливает значение по-умолчанию\n\n` +
      `*Все доступные настройки:*\n` +
      `**${SettingName.StreamStart}** - сообщение о начале стрима\n` +
      `**${SettingName.StreamStop}** - сообщение об окончании стрима\n` +
      `**${SettingName.StreamProceed}** - сообщение о продолжении стрима\n` +
      `**${SettingName.AnnouncementAdd}** - новый анонс\n` +
      `**${SettingName.AnnouncementEdit}** - изменение анонса\n` +
      `**${SettingName.AnnouncementRemove}** - отмена анонса\n\n` +
      `Другие настройки:\n` +
      `**!notify set ${SettingName.EmbedRemove}** - отменить использование Embed сообщений\n` +
      `**!notify set ${SettingName.EmbedAllow}** - разрешить использование Embed сообщений\n\n` +
      `Другие "магические" строки кроме {channel}, заменяющиеся в сообщении:\n` +
      `**{everyone}** - @everyone (чтобы не спамить @everyone сообщениями во время настройки)\n` +
      `**{here}** - @here (чтобы не спамить @here сообщениями во время настройки)\n` +
      `**{channel}** - название канала\n` +
      `**{url}** - URL канала\n` +
      `**{game}** - игра на стриме или в анонсе\n` +
      `**{title}** - название стрима или анонса\n` +
      `**{start}** - время начала трансляции в анонсе (только для анонсов)\n`;
  }

  msg.channel.send(text);

  return text;
}
