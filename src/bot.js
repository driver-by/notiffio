'use strict';

const dotenv = require('dotenv').config({path: 'local.env'});
const process = require('process');
const SECRET_KEY = process.env.SECRET_KEY;
const discord = require('discord.js');

class Bot {
    constructor() {}

    init() {
        this._client = new discord.Client();
        this._client.on('ready', () => {
            console.log(`Logged in as ${this._client.user.tag}!`);
        });

        this._client.on('message', msg => {
            if (msg.content === 'ping') {
                msg.reply('Pong!');
            }
        });

        this._client.login(SECRET_KEY);
    }

    start() {
        this.init();
    }
}

module.exports =  Bot;
