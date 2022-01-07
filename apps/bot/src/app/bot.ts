import {
  BaseGuildTextChannel,
  Client,
  Intents,
  MessageEmbed,
} from 'discord.js';
import { CommandCenter } from './command-center';
import { DataStorage } from './data-storage';
import { GoodgameService } from './subscriptions/goodgame';
import { TwitchService } from './subscriptions/twitch';
import { StreamingServiceConfig } from './subscriptions/streaming-service';
import { BaseService } from './subscriptions/base-service';
import { getLogger } from './services/logger';
import { Logger } from 'winston';
import Timeout = NodeJS.Timeout;
import {
  EVENT_ALL,
  EVENT_BROADCAST_ADD,
  EVENT_BROADCAST_CHANGE,
  EVENT_BROADCAST_REMOVE,
  EVENT_CHANNEL_NOT_FOUND,
  EVENT_GO_LIVE,
  EVENT_GO_LIVE_AGAIN,
  EVENT_GO_OFFLINE,
} from './subscriptions/events';
import { getServiceInfo } from './services/helper';
import * as dateAndTime from 'date-and-time';
import { DataAccess } from '../../../../libs/data-access/src';

const SECRET_KEY = process.env.SECRET_KEY;

export class Bot {
  private readonly DB_FILE = 'db.json';
  private readonly INTERVAL: number = 10000;
  private readonly START_COLOR = '#43bf35';
  private readonly STOP_COLOR = '#a8a8a8';
  private readonly ANNOUNCEMENT_COLOR = '#287bba';
  private readonly HTTP_PERMISSIONS_ERROR_STATUS = 403;

  private dataStorage: DataStorage;
  private client: Client;
  private commandCenter: CommandCenter;
  private services: Array<BaseService>;
  private logger: Logger;
  private interval: Timeout;
  private updateSubscriptionsInProgress: boolean;

  constructor() {
    if (process.env.INTERVAL) {
      this.INTERVAL = Number(process.env.INTERVAL);
    }
    this.init();
  }

  private async init() {
    this.dataStorage = new DataStorage(this.DB_FILE);
    this.logger = getLogger();
    const dataAccessTest = new DataAccess(
      process.env.MONGO_URL,
      process.env.MONGO_DB
    );
    await dataAccessTest.connect().then(
      () => {},
      (error) => {
        this.logger.error(`DB connection, url: ${error}`);
      }
    );
    dataAccessTest.onErrorLog((error) => {
      this.logger.error('DB error');
    });
    this.commandCenter = new CommandCenter(this.dataStorage);
    this.client = new Client({
      intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
    });
    this.client.on('ready', this._ready.bind(this));
    this.client.on('messageCreate', this._message.bind(this));
    this.client.on('error', this._error.bind(this));
    this.client.on('rateLimit', this._rateLimit.bind(this));
    this.client.on('shardDisconnected', this._disconnect.bind(this));
    this.client.on('shardReconnecting', this._reconnecting.bind(this));
    this.client.on('guildCreate', this._guildCreate.bind(this));
    this.client.on('guildDelete', this._guildDelete.bind(this));
    this.client.login(SECRET_KEY).then(() => {
      this.services = this.getServices();
      this._subscribeToEvents(this.services);
      this._updateSubscriptions();
      this.interval = setInterval(
        this._updateSubscriptions.bind(this),
        this.INTERVAL
      );
    });
  }

  getServices(): Array<BaseService> {
    return [
      new GoodgameService(this.dataStorage, this.getStreamingServiceConfig()),
      new TwitchService(this.dataStorage, this.getStreamingServiceConfig()),
    ];
  }

  getStreamingServiceConfig(): StreamingServiceConfig {
    return {
      UPDATE_INTERVAL: process.env.UPDATE_INTERVAL,
    };
  }

  _message(msg) {
    this._processCommand(msg);
  }

  _processCommand(msg) {
    const result = this.commandCenter.process(msg);
    if (result) {
      this.logger.info(
        `Command '${msg.content}' => "${result}"` +
          `<${msg.guild.id}/${msg.guild.name}--${msg.channel.id}/${msg.channel.name}>`
      );
    }
  }

  _ready() {
    this.logger.info(`Logged in as ${this.client.user.tag}!`);
  }

  _error(error) {
    this.logger.error(`Discord.js error ${error}`);
  }

  _rateLimit(event) {
    this.logger.error(`Discord.js rate limit error ${event}`);
  }

  _disconnect(event) {
    this.logger.error(`Discord.js disconnect ${event}`);
  }

  _reconnecting(event) {
    this.logger.info(`Discord.js reconnecting ${event}`);
  }

  _guildCreate(server) {
    this.logger.info(`Discord.js guildCreate ${server.name} ${server.id}`);
    this.dataStorage.serverAdd(server);
  }

  _guildDelete(server) {
    this.logger.info(`Discord.js guildDelete ${server.name} ${server.id}`);
    this.dataStorage.serverRemove(server.id);
  }

  _updateSubscriptions() {
    const promises = [];
    if (this.updateSubscriptionsInProgress) {
      return;
    }
    this.updateSubscriptionsInProgress = true;
    this.services.forEach((service) => promises.push(service.update()));
    Promise.all(promises).finally(
      () => (this.updateSubscriptionsInProgress = false)
    );
  }

  _subscribeToEvents(services) {
    services.forEach((service) => {
      service.on(EVENT_ALL, this._onEvents.bind(this, service));
    });
  }

  _getDataForMessage(params) {
    return {
      subscription: params.subscription,
      broadcast: params.broadcast,
    };
  }

  _onEvents(service, eventName, params) {
    params.servers.forEach((server) => {
      let msg;
      let embed;
      let messageCustomizable;
      const s = this.client.guilds.cache.get(server.serverId);
      if (!s) {
        this.logger.warn(
          `Server not found! %s. Removing it from DB`,
          server.serverId
        );
        this.dataStorage.serverRemove(server.serverId);
        return;
      }
      const channel = <BaseGuildTextChannel>(
        s.channels.cache.get(server.channelId)
      );
      if (!channel) {
        this.logger.warn(
          `Channel not found! %s. Removing it from DB`,
          server.channelId
        );
        this.dataStorage.subscriptionRemoveList(
          server.serverId,
          server.channelId
        );
        return;
      }
      const isEmbedRemoved = this.dataStorage.getSettingMessage(
        this.dataStorage.SETTING_EMBED_REMOVE,
        server.serverId
      );
      switch (eventName) {
        case EVENT_GO_LIVE:
          messageCustomizable = this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            this.dataStorage.SETTING_STREAM_START_MESSAGE,
            `@everyone Стрим на канале **{channel}** начался!`
          );
          if (messageCustomizable) {
            msg = `${messageCustomizable}`;
            if (isEmbedRemoved) {
              msg +=
                `**${params.subscription.title.trim()}**\n` +
                `*${params.subscription.game}*\n` +
                `Заходите на ${params.subscription.url}\n` +
                `${params.subscription.img}`;
            } else {
              embed = new MessageEmbed()
                .setColor(this.START_COLOR)
                .setTitle(
                  this._setDefaultTextIfEmpty(params.subscription.title.trim())
                )
                .setAuthor(
                  params.subscription.nickname,
                  params.subscription.avatar,
                  params.subscription.url
                )
                .addField(
                  'Игра:',
                  this._setDefaultTextIfEmpty(params.subscription.game)
                )
                .addField('Ссылка', params.subscription.url)
                .setImage(this._generateImageLink(params.subscription.img));
            }
          }
          break;
        case EVENT_GO_OFFLINE:
          messageCustomizable = this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            this.dataStorage.SETTING_STREAM_STOP_MESSAGE,
            `Стрим на канале **{channel}** закончился`
          );
          if (messageCustomizable) {
            msg = `${messageCustomizable}`;
          }
          break;
        case EVENT_GO_LIVE_AGAIN:
          messageCustomizable = this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            this.dataStorage.SETTING_STREAM_PROCEED_MESSAGE,
            `Стрим на канале **{channel}** продолжается!`
          );
          if (messageCustomizable) {
            msg = `${messageCustomizable}`;
            if (isEmbedRemoved) {
              msg =
                `\n**${params.subscription.title.trim()}**\n` +
                `*${params.subscription.game}*\n`;
            } else {
              embed = new MessageEmbed()
                .setColor(this.START_COLOR)
                .setTitle(
                  this._setDefaultTextIfEmpty(params.subscription.title.trim())
                )
                .setAuthor(
                  params.subscription.nickname,
                  params.subscription.avatar,
                  params.subscription.url
                )
                .addField(
                  'Игра:',
                  this._setDefaultTextIfEmpty(params.subscription.game)
                )
                .addField('Ссылка', params.subscription.url);
            }
          }
          break;
        case EVENT_CHANNEL_NOT_FOUND:
          msg = `Канал ${params.channel} не найден`;
          break;
        case EVENT_BROADCAST_ADD:
          messageCustomizable = this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            this.dataStorage.SETTING_ANNOUNCEMENT_ADD_MESSAGE,
            `Анонс на канале {channel}:`
          );
          if (messageCustomizable) {
            msg = `${messageCustomizable}`;
            if (isEmbedRemoved) {
              msg =
                `\n**${params.broadcast.title.trim()}**\n` +
                `*${params.broadcast.game}*\n` +
                `Начало в ${this._getTimeFormatted(
                  params.broadcast.start
                )} (мск)` +
                `${this._getTimeElapsedText(params.broadcast.start)}\n` +
                `${params.subscription.img}`;
            } else {
              embed = new MessageEmbed()
                .setColor(this.ANNOUNCEMENT_COLOR)
                .setTitle(
                  this._setDefaultTextIfEmpty(params.broadcast.title.trim())
                )
                .setAuthor(
                  params.subscription.nickname,
                  params.subscription.avatar,
                  params.subscription.url
                )
                .addField(
                  'Начало:',
                  `${this._getTimeFormatted(
                    params.broadcast.start
                  )} (мск)${this._getTimeElapsedText(params.broadcast.start)}`
                )
                .addField(
                  'Игра:',
                  this._setDefaultTextIfEmpty(params.broadcast.game)
                )
                .addField('Ссылка', params.subscription.url)
                .setImage(this._generateImageLink(params.subscription.img));
            }
          }
          break;
        case EVENT_BROADCAST_CHANGE:
          messageCustomizable = this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            this.dataStorage.SETTING_ANNOUNCEMENT_EDIT_MESSAGE,
            `Анонс на канале {channel} изменен:`
          );
          if (messageCustomizable) {
            msg = `${messageCustomizable}`;
            if (isEmbedRemoved) {
              msg += `\n**${params.broadcast.title.trim()}**\n`;
              if (params.broadcast.game !== params.broadcastPrevious.game) {
                msg +=
                  `~~${params.broadcastPrevious.game}~~ ` +
                  `**${params.broadcast.game}**\n`;
              } else {
                msg += `**${params.broadcast.game}**\n`;
              }
              if (params.broadcast.start !== params.broadcastPrevious.start) {
                msg +=
                  `Начало в ~~${this._getTimeFormatted(
                    params.broadcastPrevious.start
                  )}~~ ` +
                  `${this._getTimeFormatted(params.broadcast.start)} (мск)` +
                  `${this._getTimeElapsedText(params.broadcast.start)}\n`;
              } else {
                msg +=
                  `Начало в ${this._getTimeFormatted(
                    params.broadcast.start
                  )} (мск)` +
                  `${this._getTimeElapsedText(params.broadcast.start)}\n`;
              }
            } else {
              embed = new MessageEmbed()
                .setColor(this.ANNOUNCEMENT_COLOR)
                .setTitle(
                  this._setDefaultTextIfEmpty(params.broadcast.title.trim())
                )
                .setAuthor(
                  params.subscription.nickname,
                  params.subscription.avatar,
                  params.subscription.url
                );
              if (params.broadcast.start !== params.broadcastPrevious.start) {
                embed.addField(
                  'Начало:',
                  `~~${this._getTimeFormatted(
                    params.broadcastPrevious.start
                  )}~~ ` +
                    `${this._getTimeFormatted(params.broadcast.start)} (мск)` +
                    `${this._getTimeElapsedText(params.broadcast.start)}`
                );
              } else {
                embed.addField(
                  'Начало:',
                  `${this._getTimeFormatted(params.broadcast.start)} (мск)` +
                    `${this._getTimeElapsedText(params.broadcast.start)}`
                );
              }
              if (params.broadcast.game !== params.broadcastPrevious.game) {
                embed.addField(
                  'Игра:',
                  `~~${params.broadcastPrevious.game}~~ **${params.broadcast.game}**`
                );
              } else {
                embed.addField(
                  'Игра:',
                  this._setDefaultTextIfEmpty(`**${params.broadcast.game}**`)
                );
              }
              embed
                .addField('Ссылка', params.subscription.url)
                .setImage(this._generateImageLink(params.subscription.img));
            }
          }
          break;
        case EVENT_BROADCAST_REMOVE:
          messageCustomizable = this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            this.dataStorage.SETTING_ANNOUNCEMENT_REMOVE_MESSAGE,
            `Анонс на канале {channel} отменен`
          );
          if (messageCustomizable) {
            msg = `${messageCustomizable}`;
            if (isEmbedRemoved) {
              msg +=
                `\n**${params.broadcastPrevious.title.trim()}** ` +
                `(*${params.broadcastPrevious.game}*)`;
            } else {
              embed = new MessageEmbed()
                .setColor(this.STOP_COLOR)
                .setTitle(
                  this._setDefaultTextIfEmpty(
                    params.broadcastPrevious.title.trim()
                  )
                )
                .setAuthor(
                  params.subscription.nickname,
                  params.subscription.avatar,
                  params.subscription.url
                )
                .addField(
                  'Игра:',
                  this._setDefaultTextIfEmpty(params.broadcastPrevious.game)
                );
            }
          }
          break;
      }
      if (msg) {
        this.logger.info(msg);
        channel
          .send({ content: msg, embeds: embed ? [embed] : null })
          .catch((error) => {
            this.logger.error(
              `Discord send error ${error.httpStatus} ${server.serverId}/${server.channelId}`
            );
            if (error.httpStatus === this.HTTP_PERMISSIONS_ERROR_STATUS) {
              this.dataStorage.subscriptionRemoveList(
                server.serverId,
                server.channelId
              );
            }
          });
        if (embed) {
          this.logger.info(
            `${embed.title} ${embed.fields.reduce(
              (acc, val) => `${acc}, ${val.name}: ${val.value}`,
              ''
            )}`
          );
        }
      }
    });
  }

  _getMessage(url, serverId, data, setting, defaultMessage) {
    const channel = getServiceInfo(url);
    let message = this.dataStorage.getSettingMessage(
      setting,
      serverId,
      this.dataStorage.getSubscriptionName(channel.service, channel.channel)
    );
    if (message === undefined || message === null) {
      message = defaultMessage;
    }
    message = message.replace('{channel}', data.subscription.nickname);
    message = message.replace('{everyone}', '@everyone');
    message = message.replace('{here}', '@here');
    message = message.replace('{url}', data.subscription.url);
    if (
      setting === this.dataStorage.SETTING_ANNOUNCEMENT_ADD_MESSAGE ||
      setting === this.dataStorage.SETTING_ANNOUNCEMENT_EDIT_MESSAGE ||
      setting === this.dataStorage.SETTING_ANNOUNCEMENT_REMOVE_MESSAGE
    ) {
      if (data.broadcast) {
        message = message.replace(
          '{start}',
          data.broadcast.start
            ? this._getTimeFormatted(data.broadcast.start)
            : ''
        );
        message = message.replace('{title}', data.broadcast.title || '');
        message = message.replace('{game}', data.broadcast.game || '');
      }
    } else if (data.subscription) {
      message = message.replace('{game}', data.subscription.game || '');
      message = message.replace('{title}', data.subscription.title || '');
    }

    return message;
  }

  /**
   * Format time HH:mm DD.MM and in MSK timezone
   * @param timestamp
   * @returns {*|string|FormatWrap}
   * @private
   */
  _getTimeFormatted(timestamp) {
    const moscowOffset = 180;
    if (!timestamp) {
      return '';
    }
    let date = new Date(timestamp);
    const offset = date.getTimezoneOffset();
    date = dateAndTime.addMinutes(date, moscowOffset - offset);

    return dateAndTime.format(date, 'HH:mm DD.MM');
  }

  _getTimeElapsed(timestamp) {
    const diff = timestamp - Date.now();

    if (diff < 0) {
      return null;
    }
    const minutes = Math.round(diff / 1000 / 60) % 60;
    const hours = Math.floor(diff / 1000 / 60 / 60);

    if (hours > 0) {
      return `${hours} ч ${minutes} мин`;
    } else {
      return `${minutes} мин`;
    }
  }

  _getTimeElapsedText(timestamp, prefix = ', через ') {
    const elapsedText = this._getTimeElapsed(timestamp);

    if (elapsedText) {
      return `${prefix}${elapsedText}`;
    } else {
      return '';
    }
  }

  _setDefaultTextIfEmpty(text, defaultText = '-') {
    return text ? text : defaultText;
  }

  _generateImageLink(img) {
    // Add timestamp param to prevent discord preview caching
    return `${img}?_=${Date.now()}`;
  }
}
