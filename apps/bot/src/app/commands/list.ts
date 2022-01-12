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
    let promises = [];
    subscriptions.forEach((subscription) => {
      const promisesToAdd = subscription.servers.map(async (server) => {
        let promise;
        if (serverId === server.serverId) {
          let channelName;
          if (channelMap[server.channelId]) {
            channelName = channelMap[server.channelId];
          } else {
            promise = msg.client.channels.fetch(server.channelId);
            const channel = await promise;
            channelName = channel.name;
            channelMap[server.channelId] = channelName;
          }
          map[channelName] = map[channelName] || [];
          map[channelName].push(subscription.name);
          return promise || Promise.resolve();
        }
      });
      promises = promises.concat(promisesToAdd);
    });
    await Promise.all(promises);
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
