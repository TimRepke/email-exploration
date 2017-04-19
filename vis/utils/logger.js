'use strict';

var log4js  = require('log4js');
var config = require('./config');

var logLevel = config.system.log;

var logger = log4js.getLogger();
logger.info('loglevel: ' + logLevel);

function middleware(category) {
    var mwlogger = log4js.getLogger(category);
    mwlogger.setLevel(logLevel);
    mwlogger.info('loglevel: ' + logLevel);

    return function(req, res, next) {
        var url =  req.originalUrl || req.url;
        mwlogger.trace(req.method + ' ' + url);
        next();
    };
}

function getLogger(name) {
    var l = log4js.getLogger('['+name+']');
    l.setLevel(logLevel);
    return {
        trace: function(msg) {return l.trace(msg);},
        debug: function(msg) {return l.debug(msg);},
        info: function(msg) {return l.info(msg);},
        warn: function(msg) {return l.warn(msg);},
        error: function(msg) {return l.error(msg);},
        fatal: function(msg) {return l.fatal(msg);}
    };
}

module.exports = {
    trace: function(msg) {return logger.trace(msg);},
    debug: function(msg) {return logger.debug(msg);},
    info: function(msg) {return logger.info(msg);},
    warn: function(msg) {return logger.warn(msg);},
    error: function(msg) {return logger.error(msg);},
    fatal: function(msg) {return logger.fatal(msg);},
    l: getLogger,
    middleware: middleware
};
