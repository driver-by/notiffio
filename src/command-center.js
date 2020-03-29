'use strict';
const commands = require('./commands');

class CommandCenter {
    constructor(dataStorage) {
        this._dataStorage = dataStorage;
        this.COMMAND_PREFIX = '!notify ';
    }

    process(msg) {
        if (!msg || !msg.content.startsWith(this.COMMAND_PREFIX)) {
            return;
        }
        const command = this._splitCommand(this.COMMAND_PREFIX, msg.content);
        if (commands[command.main]) {
            return commands[command.main](command, msg, this._dataStorage);
        } else {
            return commands.default(command, msg, this._dataStorage);
        }
    }

    _splitCommand(prefix, msg) {
        const reg = new RegExp(`^${prefix}`, 'gi');
        const arr = msg.replace(reg, '').split(/\s+/);
        let result = {
            main: arr[0],
            params: arr.slice(1, arr.length),
        };

        return result;
    }
}

module.exports = CommandCenter;
