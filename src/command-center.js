'use strict';
const commands = require('./commands');

class CommandCenter {
    constructor(dataStorage) {
        this._dataStorage = dataStorage;
        this.COMMAND_PREFIX = '!';
    }

    process(msg) {
        if (!msg || !msg.content.startsWith(this.COMMAND_PREFIX)) {
            return;
        }
        const command = this._splitCommand(this.COMMAND_PREFIX, msg.content);
        switch (command.main) {
            case 'ping':
                commands.ping(command, msg, this._dataStorage);
                break;
            case 'notify':
                commands.notify(command, msg, this._dataStorage);
                break;
        }
    }

    _splitCommand(prefix, msg) {
        const arr = msg.split(' ');
        let result = {
            main: arr[0],
            params: arr.slice(1, arr.length),
            prefix: false,
        };
        if (result.main.startsWith(prefix)) {
            result.main = result.main.slice(prefix.length);
            result.prefix = true;
        }

        return result;
    }
}

module.exports = CommandCenter;