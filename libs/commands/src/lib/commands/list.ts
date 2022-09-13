import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { DataAccess, Subscription } from '../../../../data-access/src';
import { Command } from '../models/command';
import { CommandReply } from '../models/command-reply';
import { getServiceUrl } from '../../../../../apps/bot/src/app/services/helper';

export class ListCommand implements Command {
  name = 'list';

  private dataAccess: DataAccess;

  constructor(dataAccess: DataAccess) {
    this.dataAccess = dataAccess;
  }

  getCommand() {
    return new SlashCommandBuilder()
      .setName(this.name)
      .setDescription('List all subscriptions on the server')
      .setDescriptionLocalizations({
        ru: 'Показать список всех подписок на сервере',
      });
  }

  async processCommand(interaction: CommandInteraction): Promise<CommandReply> {
    const serverId = interaction.guildId;
    const channelId = interaction.channelId;
    await interaction.deferReply({ ephemeral: true });
    const subscriptions: Subscription[] =
      await this.dataAccess.getSubscriptionsList(serverId);
    const map = {};
    const thisChannelKey = 'Оповещения на этом канале:';
    const otherChannelsKey = 'Оповещения на других каналах:';
    let text = '';
    if (subscriptions?.length) {
      subscriptions.forEach((subscription) => {
        subscription.servers.forEach(async (server) => {
          if (serverId === server.serverId) {
            let channelName;
            if (channelId === server.channelId) {
              channelName = thisChannelKey;
            } else {
              channelName = otherChannelsKey;
            }
            map[channelName] = map[channelName] || [];
            map[channelName].push(
              `${subscription.name} (${getServiceUrl(subscription)})`
            );
          }
        });
      });
      [thisChannelKey, otherChannelsKey].forEach((channelName) => {
        if (map[channelName]) {
          text +=
            `${channelName}\n    ` + map[channelName].join(',\n    ') + '\n';
        }
      });
    }
    if (!text) {
      text = 'Нет оповещений';
    }
    await interaction.editReply({ content: text });

    return <CommandReply>{ text };
  }
}
