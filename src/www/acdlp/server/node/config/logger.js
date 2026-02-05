const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Définir le niveau de log selon l'environnement
const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Format personnalisé pour les logs
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Format pour la console (plus lisible en développement)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Configuration du transport pour les logs généraux avec rotation
const fileRotateTransport = new DailyRotateFile({
  filename: path.join('/var/log/acdlp', 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: customFormat,
  level: 'info'
});

// Configuration du transport pour les erreurs avec rotation
const errorRotateTransport = new DailyRotateFile({
  filename: path.join('/var/log/acdlp', 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: customFormat,
  level: 'error'
});

// Créer le logger
const logger = winston.createLogger({
  level: level,
  format: customFormat,
  defaultMeta: { service: 'acdlp-api' },
  transports: [
    // Logs généraux
    fileRotateTransport,
    // Logs d'erreurs uniquement
    errorRotateTransport
  ],
  // Gestion des rejections et exceptions non capturées
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join('/var/log/acdlp', 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: customFormat
    })
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join('/var/log/acdlp', 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: customFormat
    })
  ]
});

// En développement, ajouter aussi les logs dans la console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Helper pour logger les requêtes HTTP
logger.logRequest = (req, statusCode, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: statusCode,
    responseTime: `${responseTime}ms`,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  };

  // Ajouter l'utilisateur si authentifié
  if (req.user && req.user.email) {
    logData.user = req.user.email;
  }

  // Log en fonction du code de statut
  if (statusCode >= 500) {
    logger.error('HTTP Request Error', logData);
  } else if (statusCode >= 400) {
    logger.warn('HTTP Request Warning', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

// Helper pour logger les erreurs avec contexte
logger.logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    ...context
  });
};

module.exports = logger;
