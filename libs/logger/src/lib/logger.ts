const { createLogger, format, transports } = require('winston');

let logger;

export function getLogger() {
  if (!logger) {
    logger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
      ),
      transports: [
        new transports.Console(),
        new transports.File({ filename: 'logs/error.log', level: 'error' }),
        new transports.File({ filename: 'logs/full.log' }),
      ],
    });
  }

  return logger;
}
