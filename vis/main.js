'use strict';

var fs = require('fs');
var path = require('path');
var express = require('express');
var http = require('http');
var logger = require('./utils/logger');
var config = require('./utils/config');

var app = express();

app.set('views', path.join(__dirname, 'view/views'));
app.set('view engine', 'jade');
app.use(logger.middleware('[express]'));
app.use(express.static(path.join(__dirname, 'view')));
app.use('/', require('./routes'));

// will print stacktrace in development
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: err
    });
});

app.set('port', config.system.port);

var server = app.listen(app.get('port'), function () {
    logger.info('Express server listening on port ' + server.address().port);
});
