import { SlashCommandBuilder } from 'discord.js';
import { DataAccess } from '../../../../data-access/src';
import { Command } from '../models/command';
import { CommandReply } from '../models/command-reply';
import { getServiceInfo } from '../../../../../apps/bot/src/app/services/helper';
import { WRONG_FORMAT_TEXT } from './subscribe';

export class UnsubscribeCommand implements Command {
  name = 'unsubscribe';

  private dataAccess: DataAccess;

  private readonly subcommandFrom = 'from';
  private readonly subcommandChannel = 'this_channel';
  private readonly subcommandServer = 'this_server';
  private readonly optionHttpAddress = 'http_address';

  constructor(dataAccess: DataAccess) {
    this.dataAccess = dataAccess;
  }

  getCommand() {
    return new SlashCommandBuilder()
      .setName(this.name)
      .setDescription('Unsubscribe from notification')
      .setDescriptionLocalizations({
        ru: 'Отписаться от оповещения',
      })
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandFrom)
          .setDescription('Unsubscribe from one channel')
          .setDescriptionLocalizations({
            ru: 'Отписаться от одного канала',
          })
          .addStringOption((option) =>
            option
              .setName(this.optionHttpAddress)
              .setDescription(
                "Channel's web address (example: https://www.twitch.tv/ninja)"
              )
              .setDescriptionLocalizations({
                ru: 'Веб адрес канала (примеры: https://www.twitch.tv/ninja, https://goodgame.ru/Miker)',
              })
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandChannel)
          .setDescription('Unsubscribe from all notifications on this channel')
          .setDescriptionLocalizations({
            ru: 'Отписаться от всех оповещений на этом канале',
          })
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandServer)
          .setDescription('Unsubscribe from all notifications on this server')
          .setDescriptionLocalizations({
            ru: 'Отписаться от всех оповещений на этом сервере',
          })
      );
  }

  async processCommand(interaction: any): Promise<CommandReply> {
    const serverId = interaction.guildId;
    const channelId = interaction.channelId;
    let text;

    await interaction.deferReply({ ephemeral: true });

    const subscribeTo = await getServiceInfo(
      interaction.options.getString(this.optionHttpAddress)
    );
    if (subscribeTo?.channel) {
      const subscriptionName = this.dataAccess.getSubscriptionName(
        subscribeTo.service,
        subscribeTo.channel
      );
      const wasSubscribed = await this.dataAccess.isSubscribed(
        serverId,
        channelId,
        subscriptionName
      );
      if (wasSubscribed) {
        await this.dataAccess.subscriptionRemove(
          serverId,
          channelId,
          subscribeTo.service,
          subscribeTo.channel
        );
        text = `Отписались от канала ${subscribeTo.channel} (${subscribeTo.service}).`;
      } else {
        text =
          `В этом канале нет такой подпики, возможно вы подписаны на него в другом канале.` +
          ` Для просмотра подписок используйте команду /list`;
      }
    } else {
      text = WRONG_FORMAT_TEXT;
    }

    await interaction.editReply({ content: text });

    return <CommandReply>{ text };
  }
}
