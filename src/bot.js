'use strict';

const dotenv = require('dotenv').config({path: 'local.env'});
const process = require('process');
const SECRET_KEY = process.env.SECRET_KEY;
const discord = require('discord.js');
const DataStorage = require('./data-storage');
const CommandCenter = require('./command-center');
const Scheduler = require('./scheduler');
const services = require('./services');

class Bot {

    constructor() {
        this.DB_FILE = 'db.json';
        this.INTERVAL = 5000;
        this._init();
    }

    _init() {
        this._dataStorage = new DataStorage(this.DB_FILE);
        this._scheduler = new Scheduler(
            this.INTERVAL,
            this._dataStorage.lastCheckGet.bind(this._dataStorage),
            this._updateSubscriptions.bind(this),
        );
        this._scheduler.start();
        this._commandCenter = new CommandCenter(this._dataStorage);
        this._client = new discord.Client();
        this._client.on('ready', () => this._ready.bind(this));
        this._client.on('message', this._message.bind(this));
        this._client.login(SECRET_KEY);
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
        const subscriptions = this._dataStorage.subscriptionsGet();
        if (subscriptions) {
            let subscriptionsByService = {};
            subscriptions.forEach(sub => {
                if (!subscriptionsByService[sub.service]) {
                    subscriptionsByService[sub.service] = [];
                }
                subscriptionsByService[sub.service].push(sub.channel);
            });
            let promises = [];
            Object.keys(subscriptionsByService)
                .forEach(service => {
                    promises.push(services[service].getChannelStatuses());
                });
            await Promise.all(promises).then(result => {
                console.log('result', result);
            });
        }
        this._dataStorage.lastCheckSet(Date.now());
    }
}

module.exports =  Bot;
