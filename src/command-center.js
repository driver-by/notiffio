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
        if (commands[command.main]) {
            commands[command.main](command, msg, this._dataStorage);
        } else {
            msg.channel.send(`Command ${command.main} not found`);
        }
    }

    _splitCommand(prefix, msg) {
        const arr = msg.split(/\s+/);
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
