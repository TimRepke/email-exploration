'use strict';

var express = require('express');
var app = express();

app.use('/graph', require('./data'));

module.exports = app;