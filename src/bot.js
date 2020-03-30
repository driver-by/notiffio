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
        this._client.on('disconnect', this._disconnect.bind(this));
        this._client.on('reconnecting', this._reconnecting.bind(this));
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

        switch (eventName) {
            case events.EVENT_GO_LIVE:
                msg = `@everyone Стрим на канале **${params.subscription.nickname}** начался!\n` +
                    `**${params.subscription.title.trim()}**\n` +
                    `*${params.subscription.game.trim()}*\n`+
                    `Заходите на ${params.subscription.url}\n` +
                    `${params.subscription.img}`;
                break;
            case events.EVENT_GO_OFFLINE:
                msg = `Стрим на канале ${params.subscription.nickname} закончился`;
                break;
            case events.EVENT_CHANNEL_NOT_FOUND:
                msg = `Канал ${params.channel} не найден`;
                break;
            case events.EVENT_BROADCAST_ADD:
                msg = `@everyone Анонс на канале ${params.subscription.nickname}:\n` +
                    `**${params.broadcast.title.trim()}**\n` +
                    `*${params.broadcast.game.trim()}*\n`+
                    `Начало в ${this._getTimeFormatted(params.broadcast.start)} (мск)\n` +
                    `${params.subscription.img}`;
                break;
            case events.EVENT_BROADCAST_CHANGE:
                msg = `Анонс на канале ${params.subscription.nickname} изменен:\n`;
                msg += `**${params.broadcast.title.trim()}**\n`;
                if (params.broadcast.game !== params.broadcastPrevious.game) {
                    msg += `~~${params.broadcastPrevious.game.trim()}~~ **${params.broadcast.game.trim()}**\n`;
                } else {
                    msg += `**${params.broadcast.game.trim()}**\n`;
                }
                if (params.broadcast.start !== params.broadcastPrevious.start) {
                    msg += `Начало в ~~${this._getTimeFormatted(params.broadcastPrevious.start)}~~ ${this._getTimeFormatted(params.broadcast.start)} (мск)\n`;
                } else {
                    msg += `Начало в ${this._getTimeFormatted(params.broadcast.start)} (мск)\n`;
                }
                break;
            case events.EVENT_BROADCAST_REMOVE:
                msg = `Анонс на канале ${params.subscription.nickname} по *${params.broadcastPrevious.game.trim()}* отменен\n`;
                break;
        }

        if (msg) {
            this._logger.info(msg);
            this._sendMessageToChannels(params.servers, msg);
        }
    }

    _sendMessageToChannels(servers, msg) {
        servers.forEach(server => {
            const s = this._client.guilds
                .get(server.serverId);
            if (!s) {
                this._logger.warn(`Server not found! %s`, server.serverId);
                return;
            }
            const channel = s.channels
                .get(server.channelId);
            if (!channel) {
                this._logger.warn(`Channel not found! %s`, server.channelId);
                return;
            }
            channel.send(msg);
        });
    }

    _getTimeFormatted(timestamp) {
        return new Date(timestamp).toLocaleString(
            'ru-RU',
            { timeZone: 'Europe/Moscow' },
        );
    }
}

module.exports =  Bot;
