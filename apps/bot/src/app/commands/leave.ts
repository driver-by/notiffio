import { DataAccess } from '../../../../../libs/data-access/src';

export default function leave(command, msg, dataAccess: DataAccess) {
  const serverId = msg.guild.id;
  const text = `Очень жаль расставаться, я буду скучать. Покидаю сервер`;
  dataAccess.serverRemove(serverId);
  msg.channel.send(text);
  msg.guild.leave();

  return text;
}
