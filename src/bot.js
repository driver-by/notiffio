'use strict';

const dotenv = require('dotenv').config({path: 'local.env'});
const process = require('process');
const SECRET_KEY = process.env.SECRET_KEY;
const discord = require('discord.js');
const DataStorage = require('./data-storage');
const CommandCenter = require('./command-center');
const services = require('./services');
const {STATUS_DEAD, STATUS_LIVE} = require('./models/statuses');

class Bot {

    constructor() {
        this.DB_FILE = 'db.json';
        this.INTERVAL = 1000;
        this.UPDATE_INTERVAL = 10000;
        this.NOT_CHANGE_TO_DEAD_WITHIN = 60 * 1000;
        this._init();
    }

    _init() {
        this._dataStorage = new DataStorage(this.DB_FILE);
        this._servicesByName = this._getMapByName(services);
        this._interval =  setInterval(this._updateSubscriptions.bind(this), this.INTERVAL);
        this._commandCenter = new CommandCenter(this._dataStorage);
        this._client = new discord.Client();
        this._client.once('ready', this._ready.bind(this));
        this._client.on('message', this._message.bind(this));
        this._client.login(SECRET_KEY).then(() => {
            this._updateSubscriptions();
        });
    }

    _getMapByName(map) {
        let result = {};
        Object.keys(map)
            .forEach(i => result[map[i].name] = map[i]);
        return result;
    }

    _message(msg) {
        this._processCommand(msg);
    }

    _processCommand(msg) {
        this._commandCenter.process(msg);
    }

    _ready() {
        console.log(`Logged in as ${this._client.user.tag}!`);
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
                // TODO search in result by name, could be missed if wrong channel name
                services.forEach((service, i) => {
                    result[i].forEach((subscription, j) => {
                        const subscriptionName = this._dataStorage.getSubscriptionName(service, subscription.name);
                        const savedData = Object.assign({}, subscriptionsByName[subscriptionName]);
                        const now = Date.now();
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
                                let msg;
                                if (subscription.status === STATUS_LIVE) {
                                    msg = `@everyone ${savedData.channel} начал стримить *${subscription.game}*!\n`+
                                        `**${subscription.title}**\n` +
                                        `Заходите на ${subscription.url}\n` +
                                        `${subscription.img}`;
                                } else {
                                    msg = `${savedData.channel} закончил стрим`;
                                }
                                console.log(msg);
                                this._sendMessageToChannels(savedData.servers, msg);
                            }
                        }
                        savedData.lastCheck = now;
                        savedData.lastInfo = subscription;
                        this._dataStorage.updateSubscription(savedData.name, savedData)
                    });
                });
            });
        }
    }

    _sendMessageToChannels(servers, msg) {
        servers.forEach(server => {
            const s = this._client.guilds
                .get(server.serverId);
            if (!s) {
                console.warn('Server not found! ' + server.serverId);
                return;
            }
            const channel = s.channels
                .get(server.channelId);
            if (!channel) {
                console.warn('Channel not found! ' + server.channelId);
                return;
            }
            channel.send(msg);
        });
    }
}

module.exports =  Bot;
