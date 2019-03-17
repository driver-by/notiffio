'use strict';

const Bot = require('./src/bot');
const bot = new Bot();

process.on("unhandledRejection", console.error);