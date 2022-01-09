import { DataAccess, Subscription } from '../../../../../libs/data-access/src';

export default async function list(command, msg, dataAccess: DataAccess) {
  const serverId = msg.guild.id;
  const subscriptions: Subscription[] = await dataAccess.getSubscriptionsList(
    serverId
  );
  const map = {};
  const channelMap = {};
  let text = '';
  if (subscriptions?.length) {
    subscriptions.forEach((subscription) => {
      subscription.servers.forEach(async (server) => {
        if (serverId === server.serverId) {
          let channelName;
          if (channelMap[server.channelId]) {
            channelName = channelMap[server.channelId];
          } else {
            channelName = await msg.client.channels.fetch(server.channelId);
            channelMap[server.channelId] = channelName;
          }
          map[channelName] = map[channelName] || [];
          map[channelName].push(subscription.name);
        }
      });
    });
    Object.keys(map).forEach((channelName) => {
      text += `#${channelName}\n    ` + map[channelName].join(',\n    ') + '\n';
    });
  }
  if (!text) {
    text = 'Нет оповещений';
  }
  msg.channel.send(text);

  return text;
}
