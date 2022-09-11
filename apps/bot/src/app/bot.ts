import {
  BaseGuildTextChannel,
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from 'discord.js';
import { GoodgameService } from './subscriptions/goodgame';
import { TwitchService } from './subscriptions/twitch';
import { StreamingServiceConfig } from './subscriptions/streaming-service';
import { BaseService } from './subscriptions/base-service';
import { Logger } from 'winston';
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
import { SettingName } from '../../../../libs/data-access/src/lib/setting-name';
import Timeout = NodeJS.Timeout;
import { getLogger } from '../../../../libs/logger/src';
import { CommandController } from '../../../../libs/commands/src';

const SECRET_KEY = process.env.SECRET_KEY;

export class Bot {
  private readonly INTERVAL: number = 10000;
  private readonly START_COLOR = '#43bf35';
  private readonly STOP_COLOR = '#a8a8a8';
  private readonly ANNOUNCEMENT_COLOR = '#287bba';
  private readonly HTTP_PERMISSIONS_ERROR_STATUS = 403;

  private dataAccess: DataAccess;
  private client: Client;
  private commandController: CommandController;
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
    this.logger = getLogger();
    this.dataAccess = new DataAccess(
      process.env.MONGO_URL,
      process.env.MONGO_DB
    );
    await this.dataAccess.connect().then(
      () => {},
      (error) => {
        this.logger.error(`DB connection, url: ${error}`);
      }
    );
    this.dataAccess.onErrorLog((error) => {
      this.logger.error('DB error');
    });
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });
    this.commandController = new CommandController();
    this.commandController.registerInteractions(this.client, this.dataAccess);
    this.client.on('ready', this._ready.bind(this));
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
      new GoodgameService(this.dataAccess, this.getStreamingServiceConfig()),
      new TwitchService(this.dataAccess, this.getStreamingServiceConfig()),
    ];
  }

  getStreamingServiceConfig(): StreamingServiceConfig {
    return {
      UPDATE_INTERVAL: process.env.UPDATE_INTERVAL,
    };
  }

  _ready() {
    this.logger.info(`Logged in as ${this.client.user.tag}!`);
  }

  _error(error) {
    this.logger.error(`Discord.js error ${JSON.stringify(error)}`);
  }

  _rateLimit(event) {
    this.logger.error(`Discord.js rate limit error ${JSON.stringify(event)}`);
  }

  _disconnect(event) {
    this.logger.error(`Discord.js disconnect ${JSON.stringify(event)}`);
  }

  _reconnecting(event) {
    this.logger.info(`Discord.js reconnecting ${JSON.stringify(event)}`);
  }

  _guildCreate(server) {
    this.logger.info(`Discord.js guildCreate ${server.name} ${server.id}`);
    this.dataAccess.serverAdd(server.id, server.name);
  }

  _guildDelete(server) {
    this.logger.info(`Discord.js guildDelete ${server.name} ${server.id}`);
    this.dataAccess.serverRemove(server.id);
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
    params.servers.forEach(async (server) => {
      let msg;
      let embed;
      let messageCustomizable;

      const isEmbedRemoved = await this.dataAccess.getSettingMessage(
        SettingName.EmbedRemove,
        server.serverId
      );
      switch (eventName) {
        case EVENT_GO_LIVE:
          messageCustomizable = await this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            SettingName.StreamStart,
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
              embed = new EmbedBuilder()
                .setColor(this.START_COLOR)
                .setTitle(
                  this._setDefaultTextIfEmpty(params.subscription.title.trim())
                )
                .setAuthor(
                  this._getAuthor(
                    params.subscription.nickname,
                    params.subscription.avatar,
                    params.subscription.url
                  )
                )
                .addFields([
                  {
                    name: 'Игра:',
                    value: this._setDefaultTextIfEmpty(
                      params.subscription.game
                    ),
                  },
                  {
                    name: 'Ссылка',
                    value: params.subscription.url,
                  },
                ])
                .setImage(this._generateImageLink(params.subscription.img));
            }
          }
          break;
        case EVENT_GO_OFFLINE:
          messageCustomizable = await this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            SettingName.StreamStop,
            `Стрим на канале **{channel}** закончился`
          );
          if (messageCustomizable) {
            msg = `${messageCustomizable}`;
          }
          break;
        case EVENT_GO_LIVE_AGAIN:
          messageCustomizable = await this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            SettingName.StreamProceed,
            `Стрим на канале **{channel}** продолжается!`
          );
          if (messageCustomizable) {
            msg = `${messageCustomizable}`;
            if (isEmbedRemoved) {
              msg =
                `\n**${params.subscription.title.trim()}**\n` +
                `*${params.subscription.game}*\n`;
            } else {
              embed = new EmbedBuilder()
                .setColor(this.START_COLOR)
                .setTitle(
                  this._setDefaultTextIfEmpty(params.subscription.title.trim())
                )
                .setAuthor(
                  this._getAuthor(
                    params.subscription.nickname,
                    params.subscription.avatar,
                    params.subscription.url
                  )
                )
                .addFields([
                  {
                    name: 'Игра:',
                    value: this._setDefaultTextIfEmpty(
                      params.subscription.game
                    ),
                  },
                  {
                    name: 'Ссылка',
                    value: params.subscription.url,
                  },
                ]);
            }
          }
          break;
        case EVENT_CHANNEL_NOT_FOUND:
          msg = `Канал ${params.channel} не найден`;
          break;
        case EVENT_BROADCAST_ADD:
          messageCustomizable = await this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            SettingName.AnnouncementAdd,
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
              embed = new EmbedBuilder()
                .setColor(this.ANNOUNCEMENT_COLOR)
                .setTitle(
                  this._setDefaultTextIfEmpty(params.broadcast.title.trim())
                )
                .setAuthor(
                  this._getAuthor(
                    params.subscription.nickname,
                    params.subscription.avatar,
                    params.subscription.url
                  )
                )
                .addFields([
                  {
                    name: 'Начало:',
                    value: `${this._getTimeFormatted(
                      params.broadcast.start
                    )} (мск)${this._getTimeElapsedText(
                      params.broadcast.start
                    )}`,
                  },
                  {
                    name: 'Игра:',
                    value: this._setDefaultTextIfEmpty(params.broadcast.game),
                  },
                  {
                    name: 'Ссылка',
                    value: params.subscription.url,
                  },
                ])
                .setImage(this._generateImageLink(params.subscription.img));
            }
          }
          break;
        case EVENT_BROADCAST_CHANGE:
          messageCustomizable = await this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            SettingName.AnnouncementEdit,
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
              embed = new EmbedBuilder()
                .setColor(this.ANNOUNCEMENT_COLOR)
                .setTitle(
                  this._setDefaultTextIfEmpty(params.broadcast.title.trim())
                )
                .setAuthor(
                  this._getAuthor(
                    params.subscription.nickname,
                    params.subscription.avatar,
                    params.subscription.url
                  )
                );
              if (params.broadcast.start !== params.broadcastPrevious.start) {
                embed.addFields([
                  {
                    name: 'Начало:',
                    value:
                      `~~${this._getTimeFormatted(
                        params.broadcastPrevious.start
                      )}~~ ` +
                      `${this._getTimeFormatted(
                        params.broadcast.start
                      )} (мск)` +
                      `${this._getTimeElapsedText(params.broadcast.start)}`,
                  },
                ]);
              } else {
                embed.addFields([
                  {
                    name: 'Начало:',
                    value:
                      `${this._getTimeFormatted(
                        params.broadcast.start
                      )} (мск)` +
                      `${this._getTimeElapsedText(params.broadcast.start)}`,
                  },
                ]);
              }
              if (params.broadcast.game !== params.broadcastPrevious.game) {
                embed.addFields([
                  {
                    name: 'Игра:',
                    value: `~~${params.broadcastPrevious.game}~~ **${params.broadcast.game}**`,
                  },
                ]);
              } else {
                embed.addFields([
                  {
                    name: 'Игра:',
                    value: this._setDefaultTextIfEmpty(
                      `**${params.broadcast.game}**`
                    ),
                  },
                ]);
              }
              embed
                .addFields([
                  {
                    name: 'Ссылка',
                    value: params.subscription.url,
                  },
                ])
                .setImage(this._generateImageLink(params.subscription.img));
            }
          }
          break;
        case EVENT_BROADCAST_REMOVE:
          messageCustomizable = await this._getMessage(
            params.subscription.url,
            server.serverId,
            this._getDataForMessage(params),
            SettingName.AnnouncementRemove,
            `Анонс на канале {channel} отменен`
          );
          if (messageCustomizable) {
            msg = `${messageCustomizable}`;
            if (isEmbedRemoved) {
              msg +=
                `\n**${params.broadcastPrevious.title.trim()}** ` +
                `(*${params.broadcastPrevious.game}*)`;
            } else {
              embed = new EmbedBuilder()
                .setColor(this.STOP_COLOR)
                .setTitle(
                  this._setDefaultTextIfEmpty(
                    params.broadcastPrevious.title.trim()
                  )
                )
                .setAuthor(
                  this._getAuthor(
                    params.subscription.nickname,
                    params.subscription.avatar,
                    params.subscription.url
                  )
                )
                .addFields([
                  {
                    name: 'Игра:',
                    value: this._setDefaultTextIfEmpty(
                      params.broadcastPrevious.game
                    ),
                  },
                ]);
            }
          }
          break;
      }
      if (msg) {
        this._sendMessage(server, {
          content: msg,
          embeds: embed ? [embed] : null,
        }).then(
          (result) => {
            this.logger.info(msg);
            if (embed?.fields) {
              this.logger.info(
                `Embed: ${embed.title} ${embed.fields.reduce(
                  (acc, val) => `${acc}, ${val.name}: ${val.value}`,
                  ''
                )}`
              );
            }
          },
          (result) => {
            if (!result.serverFound) {
              this.logger.warn(
                `Server not found! %s. Removing it from DB`,
                server.serverId
              );
              this.dataAccess.serverRemove(server.serverId);
            } else if (!result.channelFound) {
              this.logger.warn(
                `Channel not found! %s. Removing it from DB`,
                server.channelId
              );
              this.dataAccess.subscriptionRemoveList(
                server.serverId,
                server.channelId
              );
            }
          }
        );
      }
    });
  }

  async _getMessage(url, serverId, data, setting, defaultMessage) {
    const channel = getServiceInfo(url);
    let message = await this.dataAccess.getSettingMessage(
      setting,
      serverId,
      this.dataAccess.getSubscriptionName(channel.service, channel.channel)
    );
    if (message === undefined || message === null) {
      message = defaultMessage;
    }
    message = message.replace('{channel}', data.subscription.nickname);
    message = message.replace('{everyone}', '@everyone');
    message = message.replace('{here}', '@here');
    message = message.replace('{url}', data.subscription.url);
    if (
      setting === SettingName.AnnouncementAdd ||
      setting === SettingName.AnnouncementEdit ||
      setting === SettingName.AnnouncementRemove
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
    const moscowOffset = -180;
    if (!timestamp) {
      return '';
    }
    let date = new Date(timestamp);
    const offset = date.getTimezoneOffset();
    date = dateAndTime.addMinutes(date, offset - moscowOffset);

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

  _getAuthor(name, iconURL, url) {
    return {
      name,
      iconURL,
      url,
    };
  }

  async _sendMessage(server, message) {
    return new Promise(async (resolve, reject) => {
      const data: any = await this._sendMessageSharding(
        server.serverId,
        server.channelId,
        message
      );
      if (!data) {
        reject({});
        return;
      }
      const serverFound = Boolean(data.server);
      const channelFound = Boolean(data.channel);
      if (!serverFound || !channelFound) {
        reject({ serverFound, channelFound });
      }
      if (data.httpStatus) {
        this.logger.error(
          `Discord send error ${data.httpStatus} ${server.serverId}/${server.channelId}`
        );
        if (data.httpStatus === this.HTTP_PERMISSIONS_ERROR_STATUS) {
          reject({ serverFound, channelFound: false });
        }
      }
      resolve({ serverFound, channelFound });
    });
  }

  async _sendMessageSharding(serverId, channelId, message) {
    const results = await this.client.shard.broadcastEval(
      async (clientShard, { serverId, channelId, message }) => {
        const server = clientShard.guilds.cache.get(serverId);
        if (!server) {
          return {};
        }
        const channel = <BaseGuildTextChannel>(
          server.channels.cache.get(channelId)
        );
        if (!channel) {
          return { server };
        }
        const httpStatus = await channel.send(message).then(
          () => null,
          (error) => {
            return error.status;
          }
        );
        return { server, channel, httpStatus };
      },
      { context: { serverId, channelId, message } }
    );
    return results.find((data: any) => data.server) || null;
  }
}
