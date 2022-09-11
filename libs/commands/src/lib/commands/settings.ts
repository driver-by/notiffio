import { SlashCommandBuilder } from 'discord.js';
import { DataAccess } from '../../../../data-access/src';
import { Command } from '../models/command';
import { CommandReply } from '../models/command-reply';
import { getServiceInfo } from '../../../../../apps/bot/src/app/services/helper';
import {
  DiscordTextSettingName,
  getSettingName,
  SettingName,
} from '../../../../data-access/src/lib/setting-name';

export class SettingsCommand implements Command {
  name = 'settings';

  private dataAccess: DataAccess;

  private readonly subcommandHelp = 'help';
  private readonly subcommandText = 'text';
  private readonly subcommandTextForSubscription = 'text_for_subscription';
  private readonly subcommandSetDefault = 'set_default';
  private readonly subcommandSetDefaultForSubscription =
    'set_default_for_subscription';
  private readonly subcommandMute = 'mute';
  private readonly subcommandUnmute = 'unmute';
  private readonly subcommandEmbed = 'embed';
  private readonly optionTextType = 'type';
  private readonly optionText = 'text';
  private readonly optionHttpAddress = 'http_address';
  private readonly optionEmbed = 'embed';
  private readonly choiceOn = 'on';
  private readonly choiceOff = 'off';

  private readonly settingSaveError = `Не удалось сохранить, проверьте название канала`;

  constructor(dataAccess: DataAccess) {
    this.dataAccess = dataAccess;
  }

  getCommand() {
    return new SlashCommandBuilder()
      .setName(this.name)
      .setDescription('Change settings of Notiffio bot')
      .setDescriptionLocalizations({
        ru: 'Изменить настройки бота Notiffio',
      })
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandHelp)
          .setDescription('Show /settings commands description')
          .setDescriptionLocalizations({
            ru: 'Показать описание команд /settings',
          })
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandText)
          .setDescription('Change text of notifications')
          .setDescriptionLocalizations({
            ru: 'Изменить текст оповещений',
          })
          .addStringOption(this.notificationTypeOption.bind(this))
          .addStringOption(this.notificationTextOption.bind(this))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandTextForSubscription)
          .setDescription(
            'Change text of notifications for one specific subscription'
          )
          .setDescriptionLocalizations({
            ru: 'Изменить текст оповещений только для одной подписки',
          })
          .addStringOption(this.notificationTypeOption.bind(this))
          .addStringOption(this.notificationTextOption.bind(this))
          .addStringOption(this.notificationHttpAddress.bind(this))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandSetDefault)
          .setDescription('Set default text of notifications')
          .setDescriptionLocalizations({
            ru: 'Установить текст оповещений по-умолчанию',
          })
          .addStringOption(this.notificationTypeOption.bind(this))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandSetDefaultForSubscription)
          .setDescription(
            'Set default text of notifications for one specific subscription'
          )
          .setDescriptionLocalizations({
            ru: 'Установить текст оповещений по-умолчанию только для одной подписки',
          })
          .addStringOption(this.notificationTypeOption.bind(this))
          .addStringOption(this.notificationHttpAddress.bind(this))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandMute)
          .setDescription('Switch off notifications of a specific type')
          .setDescriptionLocalizations({
            ru: 'Отключить оповещения определенного типа',
          })
          .addStringOption(this.notificationTypeOption.bind(this))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandUnmute)
          .setDescription('Switch on notifications of a specific type')
          .setDescriptionLocalizations({
            ru: 'Включить оповещения определенного типа',
          })
          .addStringOption(this.notificationTypeOption.bind(this))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName(this.subcommandEmbed)
          .setDescription('Toggle embeds in notifications')
          .setDescriptionLocalizations({
            ru: 'Переключить embed (встаиваемые дополнения) в оповещениях',
          })
          .addStringOption(this.embedOption.bind(this))
      );
  }

  async processCommand(interaction: any): Promise<CommandReply> {
    const serverId = interaction.guildId;
    let text = '';

    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    const type = interaction.options.getString(this.optionTextType);
    const setTextTo = interaction.options.getString(this.optionText);
    const httpAddress = interaction.options.getString(this.optionHttpAddress);
    const settingName = getSettingName(type);
    let result;

    switch (subcommand) {
      case this.subcommandHelp:
        text = this.getHelp();
        break;
      case this.subcommandText:
      case this.subcommandTextForSubscription:
        if (httpAddress) {
          const channel = getServiceInfo(httpAddress);
          if (channel?.service && channel?.channel) {
            const subscriptionName = this.dataAccess.getSubscriptionName(
              channel.service,
              channel.channel
            );
            result = await this.dataAccess.updateSettingMessage(
              settingName,
              serverId,
              setTextTo,
              subscriptionName
            );
          } else {
            text = this.settingSaveError;
          }
        } else {
          result = await this.dataAccess.updateSettingMessage(
            settingName,
            serverId,
            setTextTo
          );
        }
        break;
      case this.subcommandSetDefault:
      case this.subcommandSetDefaultForSubscription:
        if (httpAddress) {
          const channel = getServiceInfo(httpAddress);
          if (channel?.service && channel?.channel) {
            const subscriptionName = this.dataAccess.getSubscriptionName(
              channel.service,
              channel.channel
            );
            result = await this.dataAccess.removeSettingMessage(
              settingName,
              serverId,
              subscriptionName
            );
          } else {
            text = this.settingSaveError;
          }
        } else {
          result = await this.dataAccess.removeSettingMessage(
            settingName,
            serverId
          );
        }
        break;
      case this.subcommandMute:
        result = await this.dataAccess.updateSettingMessage(
          settingName,
          serverId,
          ''
        );
        break;
      case this.subcommandUnmute:
        result = await this.dataAccess.removeSettingMessage(
          settingName,
          serverId
        );
        break;
      case this.subcommandEmbed:
        const onOff = interaction.options.getString(this.optionEmbed);
        if (onOff === this.choiceOn) {
          await this.dataAccess.removeSettingMessage(
            SettingName.EmbedAllow,
            serverId
          );
          text = `Embed сообщения включены`;
        } else {
          await this.dataAccess.updateSettingMessage(
            SettingName.EmbedAllow,
            serverId,
            true
          );
          text = `Embed сообщения отключены`;
        }
        break;
    }
    if (result) {
      if (
        result?.modifiedCount > 0 ||
        result?.upsertedCount > 0 ||
        result?.matchedCount > 0
      ) {
        text = this.getSuccessfulMessage(subcommand);
      } else {
        text = this.settingSaveError;
      }
    }

    await interaction.editReply({ content: text });

    return <CommandReply>{ text };
  }

  private notificationTypeOption(option) {
    return option
      .setName(this.optionTextType)
      .setDescription('Notification Type')
      .setDescriptionLocalizations({
        ru: 'Тип оповещения',
      })
      .setRequired(true)
      .addChoices(
        {
          name: 'Stream start notification',
          name_localizations: { ru: 'Оповещение о начале стрима' },
          value: DiscordTextSettingName.StreamStart,
        },
        {
          name: 'Stream stop notification',
          name_localizations: { ru: 'Оповещение о конце стрима' },
          value: DiscordTextSettingName.StreamStop,
        },
        {
          name: 'Stream proceed notification (stream proceeds after a short period of time)',
          name_localizations: {
            ru: 'Оповещение о продолжении стрима (стрим возобнавляется через короткое время после остановки)',
          },
          value: DiscordTextSettingName.StreamProceed,
        },
        {
          name: 'Announcement add notification (only for goodgame.ru)',
          name_localizations: {
            ru: 'Оповещение о добавлении анонса (только для goodgame.ru)',
          },
          value: DiscordTextSettingName.AnnouncementAdd,
        },
        {
          name: 'Announcement edit notification (only for goodgame.ru)',
          name_localizations: {
            ru: 'Оповещение о редактировании анонса (только для goodgame.ru)',
          },
          value: DiscordTextSettingName.AnnouncementEdit,
        },
        {
          name: 'Announcement remove notification (only for goodgame.ru)',
          name_localizations: {
            ru: 'Оповещение об удалении анонса (только для goodgame.ru)',
          },
          value: DiscordTextSettingName.AnnouncementRemove,
        }
      );
  }

  private notificationTextOption(option) {
    return option
      .setName(this.optionText)
      .setDescription('Text of the notification')
      .setDescriptionLocalizations({
        ru: 'Текст оповещения',
      })
      .setRequired(true);
  }

  private notificationHttpAddress(option) {
    return option
      .setName(this.optionHttpAddress)
      .setDescription(
        'Web address of a channel that will have this text (example: https://www.twitch.tv/ninja)'
      )
      .setDescriptionLocalizations({
        ru: 'Веб адрес канала для которого установить текст (пример: https://www.twitch.tv/ninja)',
      })
      .setRequired(true);
  }

  private embedOption(option) {
    return option
      .setName(this.optionEmbed)
      .setDescription('on/off')
      .setRequired(true)
      .addChoices(
        {
          name: 'on',
          name_localizations: { ru: 'включить' },
          value: this.choiceOn,
        },
        {
          name: 'off',
          name_localizations: { ru: 'выключить' },
          value: this.choiceOff,
        }
      );
  }

  private getSuccessfulMessage(subcommand) {
    switch (subcommand) {
      case this.subcommandText:
      case this.subcommandTextForSubscription:
        return 'Настройка сохранена';
      case this.subcommandSetDefault:
      case this.subcommandSetDefaultForSubscription:
        return 'Настройка выставлена по-умолчанию';
      case this.subcommandMute:
        return 'Оповещение больше показываться не будет';
      case this.subcommandUnmute:
        return 'Оповещение включено. Текст выставлен по-умолчанию';
    }
  }

  private getHelp() {
    return (
      `Команды для изменения текста сообщений:\n` +
      `**/${this.name} ${this.subcommandText}** - для всех сообщений определенного типа на сервере\n` +
      `**/${this.name} ${this.subcommandTextForSubscription}** - для сообщений определенного типа, но только для одной из подписок\n` +
      `**/${this.name} ${this.subcommandSetDefault}** - выставить текст по-умолчанию для всех сообщений определенного типа на сервере\n` +
      `**/${this.name} ${this.subcommandSetDefaultForSubscription}** - выставить текст по-умолчанию для сообщений определенного типа, но только для одной из подписок\n\n` +
      `Нужно выбрать тип оповещения и текст для него. В тексте можно использовать специальные строки, которые будут заменены на ифнормацию о стриме/анонсе.\n\n` +
      `Пример строки: \`{everyone} Стрим на канале {channel} начался\`\n` +
      `Результат в оповещении: \`@everyone Стрим на канале ninja начался\`\n\n` +
      `Другие специальные строки, заменяющиеся в сообщении:\n` +
      `**{channel}** - название канала\n` +
      `**{url}** - URL канала\n` +
      `**{game}** - игра на стриме или в анонсе\n` +
      `**{title}** - название стрима или анонса\n` +
      `**{start}** - время начала трансляции в анонсе (только для анонсов)\n` +
      `**{everyone}** - \`@everyone\`\n` +
      `**{here}** - \`@here\`\n\n` +
      `Команды для отключения/включения определенного типа оповещений\n` +
      `**/${this.name} ${this.subcommandMute}** - отключает все оповещения определенного типа\n` +
      `**/${this.name} ${this.subcommandUnmute}** - включить все оповещения определенного типа\n\n` +
      `Команда для отключения/включения Embed сообщений\n` +
      `**/${this.name} ${this.subcommandEmbed}** - принимает параметры ${this.choiceOn}/${this.choiceOff}\n`
    );
  }
}
