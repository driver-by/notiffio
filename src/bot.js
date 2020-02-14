'use strict';

const dotenv = require('dotenv').config({path: 'local.env'});
const process = require('process');
const SECRET_KEY = process.env.SECRET_KEY;
const discord = require('discord.js');
const DataStorage = require('./data-storage');
const CommandCenter = require('./command-center');
const services = require('./services');

class Bot {

    constructor() {
        this.DB_FILE = 'db.json';
        this.INTERVAL = 1000;
        this.UPDATE_INTERVAL = 10000;
        this._init();
    }

    _init() {
        this._dataStorage = new DataStorage(this.DB_FILE);
        this._servicesByName = this._getMapByName(services);
        this._updateSubscriptions();
        this._interval =  setInterval(this._updateSubscriptions.bind(this), this.INTERVAL);
        this._commandCenter = new CommandCenter(this._dataStorage);
        this._client = new discord.Client();
        this._client.on('ready', () => this._ready.bind(this));
        this._client.on('message', this._message.bind(this));
        this._client.login(SECRET_KEY);
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
            subscriptionsToCheck.forEach(sub => {
                subscriptionsByService[sub.service] = subscriptionsByService[sub.service] ||  [];
                subscriptionsByService[sub.service].push(sub.channel);
            });
            let promises = [];
            const services = Object.keys(subscriptionsByService);
            services.forEach(service => {
                    promises.push(this._servicesByName[service].getChannelStatuses(subscriptionsByService[service]));
                });
            await Promise.all(promises).then(result => {
                // console.log('result', subscriptionsByService, result);
            });
        }
        // this._dataStorage.lastCheckSet(Date.now());
    }
}

module.exports =  Bot;
