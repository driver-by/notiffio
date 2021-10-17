import { DataStorage } from '../data-storage';

export default function remove(command, msg, dataStorage: DataStorage) {
  const serverId = msg.guild.id;
  const channelId = msg.channel.id;
  const channelName = msg.channel.name;
  let text;

  switch (command.params[0]) {
    case 'all':
      text = `Удалены все оповещения со всех каналов на сервере`;
      dataStorage.subscriptionRemoveList(serverId);
      break;
    case 'channel':
      text = `Удалены все оповещения с текущего канала #${channelName}`;
      dataStorage.subscriptionRemoveList(serverId, channelId);
      break;
    default:
      text = `Удалены все оповещения с текущего канала #${channelName}`;
      dataStorage.subscriptionRemoveList(serverId, channelId);
  }

  msg.channel.send(text);

  return text;
}
