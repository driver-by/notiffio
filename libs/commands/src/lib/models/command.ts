import { CommandInteraction } from 'discord.js';
import { CommandReply } from './command-reply';

export interface Command {
  name: string;
  getCommand();
  processCommand(interaction: CommandInteraction): Promise<CommandReply>;
}
