import { DataStorage } from '../data-storage';
import { DataAccess } from '../../../../../libs/data-access/src';

export default function list(command, msg, dataAccess: DataAccess) {
  // const server = dataAccess.serverGet(msg.guild.id);
  const map = {};
  let text = '';
  // if (server && server.subscriptions) {
  //   server.subscriptions.forEach((sub) => {
  //     map[sub.channelName] = map[sub.channelName] || [];
  //     map[sub.channelName].push(sub.name);
  //   });
  //   Object.keys(map).forEach((channelName) => {
  //     text += `#${channelName}\n    ` + map[channelName].join(',\n    ') + '\n';
  //   });
  // }
  // if (!text) {
  //   text = 'Нет оповещений';
  // }
  // msg.channel.send(text);

  return text;
}
