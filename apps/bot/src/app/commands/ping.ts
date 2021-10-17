import { DataStorage } from '../data-storage';

export default function ping(command, msg, dataStorage: DataStorage) {
  const text = `Pong!`;

  msg.reply(text);

  return text;
}
