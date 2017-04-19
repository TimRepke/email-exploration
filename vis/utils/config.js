var fs = require('fs');
var path = require('path');
var arangojs = require('arangojs');
var aql = require('arangojs').aql;

var conf = {
    arango: {
        db: 'enron',
        mails: 'mails',
        nodes: 'users',
        edges: 'sent',
        host: 'localhost',
        port: 8529,
        user: 'root',
        pw: 'test'
    },
    system: {
        log: 'TRACE',
        port: 8080
    },
    root: __dirname + '/../../'
};
var db = arangojs({url: 'http://' + conf.arango.host + ':' + conf.arango.port});
db.useBasicAuth(conf.arango.user, conf.arango.pw);
db.useDatabase(conf.arango.db);
conf.db = {
    connection: db,
    query: function(query, bindVars, opts) {
        if(query.indexOf('mails') !== -1) bindVars['@mails'] = conf.arango.mails;
        if(query.indexOf('nodes') !== -1) bindVars['@nodes'] = conf.arango.nodes;
        if(query.indexOf('edges') !== -1) bindVars['@edges'] = conf.arango.edges;

        return db.query(query, bindVars, opts);
    }
};

conf.path = function (subpath) {
    return path.resolve(conf.root, subpath);
};
module.exports = conf;
