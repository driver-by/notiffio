'use strict';

const dotenv = require('dotenv').config({path: 'local.env'});
const process = require('process');
const SECRET_KEY = process.env.SECRET_KEY;
const discord = require('discord.js');
const DataStorage = require('./data-storage');
const CommandCenter = require('./command-center');
const services = require('./services');
const {STATUS_DEAD, STATUS_LIVE} = require('./models/statuses');
const { createLogger, format, transports } = require('winston');

class Bot {

    constructor() {
        this.DB_FILE = 'db.json';
        this.INTERVAL = 1000;
        this.UPDATE_INTERVAL = 10000;
        this.NOT_CHANGE_TO_DEAD_WITHIN = 60 * 1000;
        this.NOTIFICATION_EXPIRED = 10 * 60 * 1000;
        this._init();
    }

    _init() {
        this._dataStorage = new DataStorage(this.DB_FILE);
        this._servicesByName = this._getMapServiceByName(services);
        this._interval =  setInterval(this._updateSubscriptions.bind(this), this.INTERVAL);
        this._commandCenter = new CommandCenter(this._dataStorage);
        this._client = new discord.Client();
        this._client.once('ready', this._ready.bind(this));
        this._client.on('message', this._message.bind(this));
        this._client.login(SECRET_KEY).then(() => {
            this._updateSubscriptions();
        });
        this._logger = createLogger({
            level: 'info',
            transports: [
                new transports.Console(),
                new transports.File({ filename: 'logs/error.log', level: 'error' }),
                new transports.File({ filename: 'logs/full.log' })
            ]
        });
    }

    _getMapServiceByName(map) {
        let result = {};
        Object.keys(map)
            .forEach(i => result[map[i].name] = map[i].service);
        return result;
    }

    _message(msg) {
        this._processCommand(msg);
    }

    _processCommand(msg) {
        const result = this._commandCenter.process(msg);
        if (result) {
            this._logger.info(`<${msg.guild.id}/${msg.guild.name}--${msg.channel.id}/${msg.channel.name}` +
            `Command '${msg.content}' ${result}`);
        }
    }

    _ready() {
        this._logger.info(`Logged in as ${this._client.user.tag}!`);
    }

    async _updateSubscriptions() {
        const now = Date.now();
        const subscriptionsToCheck = this._dataStorage.subscriptionsGetByLastCheck(
            now - this.UPDATE_INTERVAL
        );
        if (subscriptionsToCheck && subscriptionsToCheck.length) {
            let subscriptionsByService = {};
            let subscriptionsByName = {};
            subscriptionsToCheck.forEach(sub => {
                subscriptionsByService[sub.service] = subscriptionsByService[sub.service] ||  [];
                subscriptionsByService[sub.service].push(sub);
                subscriptionsByName[sub.name] = sub;
            });
            let promises = [];
            const services = Object.keys(subscriptionsByService);
            services.forEach(service => {
                    promises.push(this._servicesByName[service].getChannelStatuses(
                        subscriptionsByService[service].map(sub => sub.channel),
                    ));
                });
            await Promise.all(promises).then(result => {
                services.forEach((service, i) => {
                    result[i].forEach((subscription, j) => {
                        const subscriptionName = this._dataStorage.getSubscriptionName(service, subscription.name);
                        const savedData = Object.assign({}, subscriptionsByName[subscriptionName]);
                        const now = Date.now();
                        // Don't send notification if last check was too long ago (bot was switched off)
                        const skipNotificationAsItIsExpired = now - savedData.lastCheck > this.NOTIFICATION_EXPIRED;
                        if (subscription.status !== savedData.lastStatus) {
                            let skipStatusChange = false;
                            if (subscription.status === STATUS_DEAD) {
                                // Don't set as DEAD within some interval (might be temporary drop)
                                if (savedData.firstDead) {
                                    if (now - savedData.firstDead < this.NOT_CHANGE_TO_DEAD_WITHIN) {
                                        skipStatusChange = true;
                                    } else {
                                        savedData.firstDead = null;
                                    }
                                } else {
                                    savedData.firstDead = now;
                                    skipStatusChange = true;
                                }
                            }
                            if (!skipStatusChange) {
                                savedData.firstDead = null;
                                savedData.previousStatus = savedData.lastStatus;
                                savedData.statusChangeTimestamp = now;
                                savedData.lastStatus = subscription.status;
                                if (!skipNotificationAsItIsExpired) {
                                    let msg;
                                    if (subscription.status === STATUS_LIVE) {
                                        msg = `@everyone ${savedData.channel} начал стримить *${subscription.game}*!\n`+
                                            `**${subscription.title}**\n` +
                                            `Заходите на ${subscription.url}\n` +
                                            `${subscription.img}`;
                                    } else {
                                        msg = `${savedData.channel} закончил стрим`;
                                    }
                                    this._logger.info(msg);
                                    this._sendMessageToChannels(savedData.servers, msg);
                                }
                            }
                        }
                        savedData.lastCheck = now;
                        savedData.lastInfo = subscription;
                        this._dataStorage.updateSubscription(savedData.name, savedData)
                    });
                });
            }, error => {
                this._logger.error(`getChannelStatuses error`, error);
            });
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
}

module.exports =  Bot;
