const { createLogger, format, transports } = require('winston');

let logger;

function getLogger() {
    if (!logger) {
        logger = createLogger({
            level: 'info',
            transports: [
                new transports.Console(),
                new transports.File({ filename: 'logs/error.log', level: 'error' }),
                new transports.File({ filename: 'logs/full.log' })
            ]
        });
    }

    return logger;
}

module.exports = {getLogger};
