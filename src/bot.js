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
        this.INTERVAL = 5000;
        this._init();
    }

    _init() {
        this._dataStorage = new DataStorage(this.DB_FILE);
        this._commandCenter = new CommandCenter(this._dataStorage);
        this._client = new discord.Client();
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
            .map(i => new map[i](this._dataStorage));
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
        this._services.forEach(service => service.update());
    }

    _subscribeToEvents(services) {
        services.forEach(service => {
            service.on(events.EVENT_ALL, this._onEvents.bind(this, service));
        });
    }

    _onEvents(service, eventName, params) {
        let msg;
        let messageCustomizable;

        params.servers.forEach(server => {
            const s = this._client.guilds.cache
                .get(server.serverId);
            if (!s) {
                this._logger.warn(`Server not found! %s`, server.serverId);
                return;
            }
            const channel = s.channels.cache
                .get(server.channelId);
            if (!channel) {
                this._logger.warn(`Channel not found! %s`, server.channelId);
                return;
            }
            switch (eventName) {
                case events.EVENT_GO_LIVE:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        params.subscription.nickname,
                        this._dataStorage.SETTING_STREAM_START_MESSAGE,
                        `@everyone Стрим на канале **{channel}** начался!`,
                    );
                    msg = `${messageCustomizable}\n` +
                        `**${params.subscription.title.trim()}**\n` +
                        `*${params.subscription.game.trim()}*\n`+
                        `Заходите на ${params.subscription.url}\n` +
                        `${params.subscription.img}`;
                    break;
                case events.EVENT_GO_OFFLINE:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        params.subscription.nickname,
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
                        params.subscription.nickname,
                        this._dataStorage.SETTING_STREAM_PROCEED_MESSAGE,
                        `Стрим на канале **{channel}** продолжается!`,
                    );
                    if (messageCustomizable) {
                        msg = `${messageCustomizable}\n` +
                            `**${params.subscription.title.trim()}**\n` +
                            `*${params.subscription.game.trim()}*\n`;
                    }
                    break;
                case events.EVENT_CHANNEL_NOT_FOUND:
                    msg = `Канал ${params.channel} не найден`;
                    break;
                case events.EVENT_BROADCAST_ADD:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        params.subscription.nickname,
                        this._dataStorage.SETTING_ANNOUNCEMENT_ADD_MESSAGE,
                        `Анонс на канале {channel}:`,
                    );
                    if (messageCustomizable) {
                        msg = `${messageCustomizable}\n` +
                            `**${params.broadcast.title.trim()}**\n` +
                            `*${params.broadcast.game.trim()}*\n`+
                            `Начало в ${this._getTimeFormatted(params.broadcast.start)} (мск), ` +
                            `через ${this._getTimeElapsed(params.broadcast.start)}\n` +
                            `${params.subscription.img}`;
                    }
                    break;
                case events.EVENT_BROADCAST_CHANGE:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        params.subscription.nickname,
                        this._dataStorage.SETTING_ANNOUNCEMENT_EDIT_MESSAGE,
                        `Анонс на канале {channel} изменен:`,
                    );
                    if (messageCustomizable) {
                        msg = `${messageCustomizable}\n`;
                        msg += `**${params.broadcast.title.trim()}**\n`;
                        if (params.broadcast.game !== params.broadcastPrevious.game) {
                            msg += `~~${params.broadcastPrevious.game.trim()}~~ ` +
                                `**${params.broadcast.game.trim()}**\n`;
                        } else {
                            msg += `**${params.broadcast.game.trim()}**\n`;
                        }
                        if (params.broadcast.start !== params.broadcastPrevious.start) {
                            msg += `Начало в ~~${this._getTimeFormatted(params.broadcastPrevious.start)}~~ ` +
                                `${this._getTimeFormatted(params.broadcast.start)} (мск), ` +
                                `через ${this._getTimeElapsed(params.broadcast.start)}\n`;
                        } else {
                            msg += `Начало в ${this._getTimeFormatted(params.broadcast.start)} (мск), ` +
                                `через ${this._getTimeElapsed(params.broadcast.start)}\n`;
                        }
                    }
                    break;
                case events.EVENT_BROADCAST_REMOVE:
                    messageCustomizable = this._getMessage(
                        params.subscription.url,
                        server.serverId,
                        params.subscription.nickname,
                        this._dataStorage.SETTING_ANNOUNCEMENT_REMOVE_MESSAGE,
                        `Анонс на канале {channel} отменен`,
                    );
                    if (messageCustomizable) {
                        msg = `${messageCustomizable}` +
                            `**${params.broadcastPrevious.title.trim()}** ` +
                            `(*${params.broadcastPrevious.game.trim()}*)`;
                    }
                    break;
            }
            if (msg) {
                this._logger.info(msg);
                channel.send(msg);
            }
        });
    }

    _getMessage(url, serverId, nickname, setting, defaultMessage) {
        const channel = helper.getServiceInfo(url);
        let message = this._dataStorage.getSettingMessage(
            setting,
            serverId,
            this._dataStorage.getSubscriptionName(channel.service, channel.channel),
        );
        if (message === undefined || message === null) {
            message = defaultMessage;
        }
        message = message.replace('{channel}', nickname);

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
}

module.exports =  Bot;
