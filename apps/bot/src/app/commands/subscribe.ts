import { getServiceInfo } from '../services/helper';
import { DataAccess } from '../../../../../libs/data-access/src';

export default async function subscribe(command, msg, dataAccess: DataAccess) {
  const serverId = msg.guild.id;
  const serverName = msg.guild.name;
  const channelId = msg.channel.id;
  const channelName = msg.channel.name;
  const subscribeTo = getServiceInfo(command.main);
  let wasSubscribed = false;
  let isSubscribed = false;
  let text;
  if (subscribeTo && subscribeTo.channel) {
    const subscriptionName = dataAccess.getSubscriptionName(
      subscribeTo.service,
      subscribeTo.channel
    );
    wasSubscribed = await dataAccess.isSubscribed(
      serverId,
      channelId,
      subscriptionName
    );
    if (wasSubscribed) {
      await dataAccess.subscriptionRemove(
        serverId,
        channelId,
        subscribeTo.service,
        subscribeTo.channel
      );
      text = `Отписались от канала ${subscribeTo.channel} (${subscribeTo.service}).`;
    } else {
      text =
        `Успешно подписались на канал ${subscribeTo.channel} (${subscribeTo.service}).` +
        ` Вы получите оповещение, когда стрим начнется`;
      isSubscribed = true;
    }
  } else {
    text = `Неправильный формат или вебсайт. Попробуйте \`!notify {URL канала}\` (Поддерживаемые вебсайты: goodgame.ru, twitch.tv)`;
  }
  msg.channel.send(text).then(() => {
    // Subscribe only after successful message. Bot could miss permissions for a channel then no need to subscribe
    if (isSubscribed) {
      dataAccess.subscriptionAdd(
        serverId,
        channelId,
        serverName,
        channelName,
        subscribeTo.service,
        subscribeTo.channel
      );
    }
  });

  return text;
}