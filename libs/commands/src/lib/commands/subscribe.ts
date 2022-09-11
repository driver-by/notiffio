import { SlashCommandBuilder } from 'discord.js';
import { DataAccess } from '../../../../data-access/src';
import { Command } from '../models/command';
import { CommandReply } from '../models/command-reply';
import { getServiceInfo } from '../../../../../apps/bot/src/app/services/helper';

export const WRONG_FORMAT_TEXT =
  `Неправильный формат или вебсайт.` +
  ` Пример правильного параметра \`https://www.twitch.tv/ninja\`` +
  ` (Поддерживаемые вебсайты: goodgame.ru, twitch.tv)`;

export class SubscribeCommand implements Command {
  name = 'subscribe';

  private dataAccess: DataAccess;

  private readonly optionHttpAddress = 'http_address';

  constructor(dataAccess: DataAccess) {
    this.dataAccess = dataAccess;
  }

  getCommand() {
    return new SlashCommandBuilder()
      .setName(this.name)
      .setDescription('Subscribe to notification with web address')
      .setDescriptionLocalizations({
        ru: 'Подписаться на оповещение с помощью веб адреса канала',
      })
      .addStringOption((option) =>
        option
          .setName(this.optionHttpAddress)
          .setDescription(
            "Channel's web address (example: https://www.twitch.tv/ninja)"
          )
          .setDescriptionLocalizations({
            ru: 'Веб адрес канала (примеры: https://www.twitch.tv/ninja, https://goodgame.ru/channel/Miker)',
          })
          .setRequired(true)
      );
  }

  async processCommand(interaction: any): Promise<CommandReply> {
    const serverId = interaction.guildId;
    const channelId = interaction.channelId;
    const serverName = interaction.guild.name;
    let text;

    await interaction.deferReply({ ephemeral: true });

    const subscribeTo = getServiceInfo(
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
        text = `Вы уже подписаны на этот канал`;
      } else {
        const testMessage =
          `Успешно подписались на канал ${subscribeTo.channel} (${subscribeTo.service}).` +
          ` Вы получите оповещение, когда стрим начнется`;
        // Try to send message in channel to confirm that permissions are all set
        await interaction.channel.send(testMessage).then(
          () => {
            // Subscribe only after successful message. Bot could miss permissions for a channel then no need to subscribe
            text = 'Успешно подписались';
            return this.dataAccess.subscriptionAdd(
              serverId,
              channelId,
              serverName,
              subscribeTo.service,
              subscribeTo.channel
            );
          },
          (error) => {
            text =
              'Подписка не удалась, т.к. не удалось отправить сообщение в канал. Добавьте боту все права связанные с текстом в этом канале';
          }
        );
      }
    } else {
      text = WRONG_FORMAT_TEXT;
    }

    await interaction.editReply({ content: text });

    return <CommandReply>{ text };
  }
}
