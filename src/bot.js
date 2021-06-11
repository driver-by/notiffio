'use strict';

const dotenv = require('dotenv').config({path: 'local.env'});
const process = require('process');
const SECRET_KEY = process.env.SECRET_KEY;
const discord = require('discord.js');
const DataStorage = require('./data-storage');
const CommandCenter = require('./command-center');
const services = require('./services');
const events = require('./services/events');
const {getLogger} = require('./logger');
const dateAndTime = require('date-and-time');
const helper = require('./services/helper');

class Bot {

    constructor() {
        this.DB_FILE = 'db.json';
        this.INTERVAL = process.env.INTERVAL || 10000;
        this.START_COLOR = '#43bf35';
        this.STOP_COLOR = '#a8a8a8';
        this.ANNOUNCEMENT_COLOR = '#287bba';
        this.HTTP_PERMISSIONS_ERROR_STATUS = 403;
        this._init();
    }

    _init() {
        this._dataStorage = new DataStorage(this.DB_FILE);
        this._commandCenter = new CommandCenter(this._dataStorage);
        this._client = new discord.Client({retryLimit: 5});
        this._client.on('ready', this._ready.bind(this));
        this._client.on('message', this._message.bind(this));
        this._client.on('error', this._error.bind(this));
        this._client.on('rateLimit', this._rateLimit.bind(this));
        this._client.on('shardDisconnected', this._disconnect.bind(this));
        this._client.on('shardReconnecting', this._reconnecting.bind(this));
        this._client.on('guildCreate', this._guildCreate.bind(this));
        this._client.on('guildDelete', this._guildDelete.bind(this));
        this._client.login(SECRET_KEY).then(() => {
            this._services = this._getServices(services);
            this._subscribeToEvents(this._services);
            this._updateSubscriptions();
            this._interval =  setInterval(this._updateSubscriptions.bind(this), this.INTERVAL);
        });
        this._logger = getLogger();
    }

    _getServices(map) {
        return Object.keys(map)
            .map(i => new map[i](this._dataStorage, this._getStreamingServiceConfig()));
    }

    _getStreamingServiceConfig() {
        return {
            UPDATE_INTERVAL: process.env.UPDATE_INTERVAL,
        }
    }

    _message(msg) {
        this._processCommand(msg);
    }

    _processCommand(msg) {
        const result = this._commandCenter.process(msg);
        if (result) {
            this._logger.info(`Command '${msg.content}' => "${result}"` +
            `<${msg.guild.id}/${msg.guild.name}--${msg.channel.id}/${msg.channel.name}>`);
        }
    }

    _ready() {
        this._logger.info(`Logged in as ${this._client.user.tag}!`);
    }

    _error(error) {
        this._logger.error(`Discord.js error ${error}`);
    }

    _rateLimit(event) {
        this._logger.error(`Discord.js rate limit error ${event}`);
    }

    _disconnect(event) {
        this._logger.error(`Discord.js disconnect ${event}`);
    }

    _reconnecting(event) {
        this._logger.info(`Discord.js reconnecting ${event}`);
    }

    _guildCreate(server) {
        this._logger.info(`Discord.js guildCreate ${server.name} ${server.id}`);
        this._dataStorage.serverAdd(server);
    }

    _guildDelete(server) {
        this._logger.info(`Discord.js guildDelete ${server.name} ${server.id}`);
        this._dataStorage.serverRemove(server.id);
    }

    _updateSubscriptions() {
        const promises = [];
        if (this._updateSubscriptionsInProgress) {
            return;
        }
        this._updateSubscriptionsInProgress = true;
        this._services.forEach(service => promises.push(service.update()));
        Promise.all(promises)
            .finally(() => this._updateSubscriptionsInProgress = false);
    }

    _subscribeToEvents(services) {
        services.forEach(service => {
            service.on(events.EVENT_ALL, this._onEvents.bind(this, service));
        });
    }

    _getDataForMessage(params) {
        return {
            subscription: params.subscription,
            broadcast: params.broadcast,
        }
    }

    _onEvents(service, eventName, params) {
        params.servers.forEach(server => {
            let msg;
            let embed;
            let messageCustomizable;
            const s = this._client.guilds.cache
                .get(server.serverId);
            if (!s) {
                this._logger.warn(`Server not found! %s. Removing it from DB`, server.serverId);
                this._dataStorage.serverRemove(server.serverId);
                return;
            }
            const channel = s.channels.cache
                .get(server.channelId);
            if (!channel) {
                this._logger.warn(`Channel not found! %s. Removing it from DB`, server.channelId);
                this._dataStorage.subscriptionRemoveList(server.serverId, server.channelId);
                return;
            }
            let isEmbedRemoved = this._dataStorage.getSettingMessage(
                this._dataStorage.SETTING_EMBED_REMOVE,
                server.serverId
            );
            switch (eventName) {
                case events.EVENT_GO_LIVE:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        this._getDataForMessage(params),
                        this._dataStorage.SETTING_STREAM_START_MESSAGE,
                        `@everyone Стрим на канале **{channel}** начался!`,
                    );
                    if (messageCustomizable) {
                        msg = `${messageCustomizable}`;
                        if (isEmbedRemoved) {
                            msg += `**${params.subscription.title.trim()}**\n` +
                                `*${params.subscription.game.trim()}*\n`+
                                `Заходите на ${params.subscription.url}\n` +
                                `${params.subscription.img}`;
                        } else {
                            embed = new discord.MessageEmbed()
                                .setColor(this.START_COLOR)
                                .setTitle(this._setDefaultTextIfEmpty(params.subscription.title.trim()))
                                .setAuthor(params.subscription.nickname, params.subscription.avatar, params.subscription.url)
                                .addField('Игра:', this._setDefaultTextIfEmpty(params.subscription.game.trim()))
                                .addField('Ссылка', params.subscription.url)
                                .setImage(this._generateImageLink(params.subscription.img));
                        }
                    }
                    break;
                case events.EVENT_GO_OFFLINE:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        this._getDataForMessage(params),
                        this._dataStorage.SETTING_STREAM_STOP_MESSAGE,
                        `Стрим на канале **{channel}** закончился`,
                    );
                    if (messageCustomizable) {
                        msg = `${messageCustomizable}`;
                    }
                    break;
                case events.EVENT_GO_LIVE_AGAIN:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        this._getDataForMessage(params),
                        this._dataStorage.SETTING_STREAM_PROCEED_MESSAGE,
                        `Стрим на канале **{channel}** продолжается!`,
                    );
                    if (messageCustomizable) {
                        msg = `${messageCustomizable}`;
                        if (isEmbedRemoved) {
                            msg = `\n**${params.subscription.title.trim()}**\n` +
                                `*${params.subscription.game.trim()}*\n`;
                        } else {
                            embed = new discord.MessageEmbed()
                                .setColor(this.START_COLOR)
                                .setTitle(this._setDefaultTextIfEmpty(params.subscription.title.trim()))
                                .setAuthor(params.subscription.nickname, params.subscription.avatar, params.subscription.url)
                                .addField('Игра:', this._setDefaultTextIfEmpty(params.subscription.game.trim()))
                                .addField('Ссылка', params.subscription.url);
                        }
                    }
                    break;
                case events.EVENT_CHANNEL_NOT_FOUND:
                    msg = `Канал ${params.channel} не найден`;
                    break;
                case events.EVENT_BROADCAST_ADD:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        this._getDataForMessage(params),
                        this._dataStorage.SETTING_ANNOUNCEMENT_ADD_MESSAGE,
                        `Анонс на канале {channel}:`,
                    );
                    if (messageCustomizable) {
                        msg = `${messageCustomizable}`;
                        if (isEmbedRemoved) {
                            msg = `\n**${params.broadcast.title.trim()}**\n` +
                                `*${params.broadcast.game.trim()}*\n`+
                                `Начало в ${this._getTimeFormatted(params.broadcast.start)} (мск)` +
                                `${this._getTimeElapsedText(params.broadcast.start)}\n` +
                                `${params.subscription.img}`;
                        } else {
                            embed = new discord.MessageEmbed()
                                .setColor(this.ANNOUNCEMENT_COLOR)
                                .setTitle(this._setDefaultTextIfEmpty(params.broadcast.title.trim()))
                                .setAuthor(params.subscription.nickname, params.subscription.avatar, params.subscription.url)
                                .addField('Начало:', `${this._getTimeFormatted(params.broadcast.start)} (мск)${this._getTimeElapsedText(params.broadcast.start)}`)
                                .addField('Игра:', this._setDefaultTextIfEmpty(params.broadcast.game.trim()))
                                .addField('Ссылка', params.subscription.url)
                                .setImage(this._generateImageLink(params.subscription.img));
                        }
                    }
                    break;
                case events.EVENT_BROADCAST_CHANGE:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        this._getDataForMessage(params),
                        this._dataStorage.SETTING_ANNOUNCEMENT_EDIT_MESSAGE,
                        `Анонс на канале {channel} изменен:`,
                    );
                    if (messageCustomizable) {
                        msg = `${messageCustomizable}`;
                        if (isEmbedRemoved) {
                            msg += `\n**${params.broadcast.title.trim()}**\n`;
                            if (params.broadcast.game !== params.broadcastPrevious.game) {
                                msg += `~~${params.broadcastPrevious.game.trim()}~~ ` +
                                    `**${params.broadcast.game.trim()}**\n`;
                            } else {
                                msg += `**${params.broadcast.game.trim()}**\n`;
                            }
                            if (params.broadcast.start !== params.broadcastPrevious.start) {
                                msg += `Начало в ~~${this._getTimeFormatted(params.broadcastPrevious.start)}~~ ` +
                                    `${this._getTimeFormatted(params.broadcast.start)} (мск)` +
                                    `${this._getTimeElapsedText(params.broadcast.start)}\n`;
                            } else {
                                msg += `Начало в ${this._getTimeFormatted(params.broadcast.start)} (мск)` +
                                    `${this._getTimeElapsedText(params.broadcast.start)}\n`;
                            }
                        } else {
                            embed = new discord.MessageEmbed()
                                .setColor(this.ANNOUNCEMENT_COLOR)
                                .setTitle(this._setDefaultTextIfEmpty(params.broadcast.title.trim()))
                                .setAuthor(params.subscription.nickname, params.subscription.avatar, params.subscription.url)
                            if (params.broadcast.start !== params.broadcastPrevious.start) {
                                embed.addField('Начало:', `~~${this._getTimeFormatted(params.broadcastPrevious.start)}~~ ` +
                                    `${this._getTimeFormatted(params.broadcast.start)} (мск)` +
                                    `${this._getTimeElapsedText(params.broadcast.start)}`);
                            } else {
                                embed.addField('Начало:', `${this._getTimeFormatted(params.broadcast.start)} (мск)` +
                                    `${this._getTimeElapsedText(params.broadcast.start)}`);
                            }
                            if (params.broadcast.game !== params.broadcastPrevious.game) {
                                embed.addField('Игра:', `~~${params.broadcastPrevious.game.trim()}~~ **${params.broadcast.game.trim()}**`);
                            } else {
                                embed.addField('Игра:', this._setDefaultTextIfEmpty(`**${params.broadcast.game.trim()}**`));
                            }
                            embed.addField('Ссылка', params.subscription.url)
                                .setImage(this._generateImageLink(params.subscription.img));
                        }
                    }
                    break;
                case events.EVENT_BROADCAST_REMOVE:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        this._getDataForMessage(params),
                        this._dataStorage.SETTING_ANNOUNCEMENT_REMOVE_MESSAGE,
                        `Анонс на канале {channel} отменен`,
                    );
                    if (messageCustomizable) {
                        msg = `${messageCustomizable}`;
                        if (isEmbedRemoved) {
                            msg += `\n**${params.broadcastPrevious.title.trim()}** ` +
                            `(*${params.broadcastPrevious.game.trim()}*)`;
                        } else {
                            embed = new discord.MessageEmbed()
                                .setColor(this.STOP_COLOR)
                                .setTitle(this._setDefaultTextIfEmpty(params.broadcastPrevious.title.trim()))
                                .setAuthor(params.subscription.nickname, params.subscription.avatar, params.subscription.url)
                                .addField('Игра:', this._setDefaultTextIfEmpty(params.broadcastPrevious.game.trim()));
                        }
                    }
                    break;
            }
            if (msg) {
                this._logger.info(msg);
                channel.send(msg, embed)
                    .catch(error => {
                        this._logger.error(`Discord send error ${error.httpStatus} ${server.serverId}/${server.channelId}`);
                        if (error.httpStatus === this.HTTP_PERMISSIONS_ERROR_STATUS) {
                            this._dataStorage.subscriptionRemoveList(server.serverId, server.channelId);
                        }
                    });
                if (embed) {
                    this._logger.info(`${embed.title} ${embed.fields.reduce((acc, val) => `${acc}, ${val.name}: ${val.value}`, '')}`);
                }
            }
        });
    }

    _getMessage(url, serverId, data, setting, defaultMessage) {
        const channel = helper.getServiceInfo(url);
        let message = this._dataStorage.getSettingMessage(
            setting,
            serverId,
            this._dataStorage.getSubscriptionName(channel.service, channel.channel),
        );
        if (message === undefined || message === null) {
            message = defaultMessage;
        }
        message = message.replace('{channel}', data.subscription.nickname);
        message = message.replace('{everyone}', '@everyone');
        message = message.replace('{here}', '@here');
        message = message.replace('{url}', data.subscription.url);
        if (setting === this._dataStorage.SETTING_ANNOUNCEMENT_ADD_MESSAGE ||
            setting === this._dataStorage.SETTING_ANNOUNCEMENT_EDIT_MESSAGE ||
            setting === this._dataStorage.SETTING_ANNOUNCEMENT_REMOVE_MESSAGE) {
            if (data.broadcast) {
                message = message.replace('{start}', data.broadcast.start ? this._getTimeFormatted(data.broadcast.start) : '');
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
        const moscowOffset = '180';
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

module.exports =  Bot;
