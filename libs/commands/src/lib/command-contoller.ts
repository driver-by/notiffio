import { Client, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import { DataAccess } from '../../../data-access/src';
import { ListCommand } from './commands/list';
import { Command } from './models/command';
import { getLogger } from '../../../logger/src';
import { Logger } from 'winston';

export class CommandController {
  private commandClasses = [ListCommand];
  private commandsGenerated: Command[];
  private client: Client;
  private dataAccess: DataAccess;
  private logger: Logger;

  constructor() {
    this.logger = getLogger();
  }

  registerCommands(clientId: string, token: string) {
    const body = this.commands.map((command) => command.getCommand().toJSON());
    const rest = new REST({ version: '10' }).setToken(token);
    return rest.put(Routes.applicationCommands(clientId), { body });
  }

  registerInteractions(client: Client, dataAccess: DataAccess) {
    this.client = client;
    this.dataAccess = dataAccess;
    this.client.on('interactionCreate', this.onInteractionCreate.bind(this));
  }

  private get commands() {
    if (this.commandsGenerated) {
      return this.commandsGenerated;
    }
    this.commandsGenerated = this.commandClasses.map(
      (command) => new command(this.dataAccess)
    );
    return this.commandsGenerated;
  }

  private async onInteractionCreate(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }
    const { commandName } = interaction;
    const command = this.commands.find((c) => c.name === commandName);
    if (command) {
      return command.processCommand(interaction);
    } else {
      this.logger.error(`Command "${commandName}" not found`);
    }
  }
}
