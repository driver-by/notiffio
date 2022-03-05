import { DataAccess, Subscription } from '../../../../../libs/data-access/src';

export default async function list(command, msg, dataAccess: DataAccess) {
  const serverId = msg.guild.id;
  const channelId = msg.channel.id;
  const subscriptions: Subscription[] = await dataAccess.getSubscriptionsList(
    serverId
  );
  const map = {};
  const thisChannelKey = 'Оповещения на этом канале:';
  const otherChannelsKey = 'Оповещения на других каналах:';
  let text = '';
  if (subscriptions?.length) {
    subscriptions.forEach((subscription) => {
      subscription.servers.forEach(async (server) => {
        if (serverId === server.serverId) {
          let channelName;
          if (channelId === server.channelId) {
            channelName = thisChannelKey;
          } else {
            channelName = otherChannelsKey;
          }
          map[channelName] = map[channelName] || [];
          map[channelName].push(subscription.name);
        }
      });
    });
    [thisChannelKey, otherChannelsKey].forEach((channelName) => {
      if (map[channelName]) {
        text +=
          `${channelName}\n    ` + map[channelName].join(',\n    ') + '\n';
      }
    });
  }
  if (!text) {
    text = 'Нет оповещений';
  }
  msg.channel.send(text);

  return text;
}
