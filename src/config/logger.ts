import pino from 'pino';

const levels = {
  notice: 35, // Any number between info (30) and warn (40) will work the same
};

const logger = pino({
  level: process.env.PINO_LOG_LEVEL || 'info',
timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,

formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
});

export default logger;
