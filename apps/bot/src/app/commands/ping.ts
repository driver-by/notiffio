import { DataAccess } from '../../../../../libs/data-access/src';

export default function ping(command, msg, dataAccess: DataAccess) {
  const text = `Pong!`;

  msg.reply(text);

  return text;
}
