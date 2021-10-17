import { DataStorage } from './data-storage';
import { Message } from 'discord.js';
import { Commands } from './commands';

export class CommandCenter {
  private readonly COMMAND_PREFIX = '!notify ';

  private readonly dataStorage: DataStorage;

  constructor(dataStorage: DataStorage) {
    this.dataStorage = dataStorage;
  }

  process(msg: Message) {
    if (!msg || !msg.content.startsWith(this.COMMAND_PREFIX)) {
      return;
    }
    const command = CommandCenter.splitCommand(
      this.COMMAND_PREFIX,
      msg.content
    );
    if (Commands[command.main]) {
      return Commands[command.main](command, msg, this.dataStorage);
    } else {
      return Commands.subscribe(command, msg, this.dataStorage);
    }
  }

  private static splitCommand(prefix: string, msg: string) {
    const reg = new RegExp(`^${prefix}`, 'gi');
    const text = msg.replace(reg, '');
    const arr = text.split(/\s+/);
    const result = {
      main: arr[0],
      params: arr.slice(1, arr.length),
      text,
    };

    return result;
  }
}
