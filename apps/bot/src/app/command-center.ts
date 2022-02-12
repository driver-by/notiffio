import {
  DMChannel,
  Message,
  TextChannel,
  Permissions,
  NewsChannel,
  ThreadChannel,
  PartialGroupDMChannel,
} from 'discord.js';
import { Commands } from './commands';
import { DataAccess } from '../../../../libs/data-access/src';
import { getLogger } from './services/logger';
import { Logger } from 'winston';

export class CommandCenter {
  private readonly COMMAND_PREFIX = '!notify ';

  private readonly dataAccess: DataAccess;
  private readonly logger: Logger;

  constructor(dataAccess: DataAccess) {
    this.dataAccess = dataAccess;
    this.logger = getLogger();
  }

  process(msg: Message) {
    if (!msg || !msg.content.startsWith(this.COMMAND_PREFIX)) {
      return;
    }
    let channelName;
    if (!(msg instanceof DMChannel || msg instanceof PartialGroupDMChannel)) {
      const channel = <TextChannel | NewsChannel | ThreadChannel>msg.channel;
      channelName = channel.name;
      if (
        !channel
          .permissionsFor(msg.guild?.me)
          .has(Permissions.FLAGS.SEND_MESSAGES)
      ) {
        this.logger.error(
          `No SEND_MESSAGES permission ${msg.guild.name}/${channelName}`
        );
        return;
      }
    }
    const command = CommandCenter.splitCommand(
      this.COMMAND_PREFIX,
      msg.content
    );
    if (Commands[command.main]) {
      return Commands[command.main](command, msg, this.dataAccess);
    } else {
      return Commands.subscribe(command, msg, this.dataAccess);
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
