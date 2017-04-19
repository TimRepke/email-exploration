const express = require('express');
const path = require('path');
const parseUrl = require('parseurl');
const config = require('../utils/config');
let app = express();
const logger = require('../utils/logger').l('starquery');

let cache = {};

app.get('/commons', function (req, res, next) {
    logger.debug('Received query params: ');
    logger.debug(req.query);

    let uid = req.query.uid || 'users/11412795';
    let outbound = req.query.outbound || false;

    let query = '' +
        'FOR s IN @@edges\n' +
        (outbound ?
                '  FILTER s._from == @user\n' +
                '  SORT s._to\n' +
                '  COLLECT from=s._from, to=s._to INTO g\n'
                :
                '  FILTER s._to == @user\n' +
                '  SORT s._from\n' +
                '  COLLECT to=s._to, from=s._from INTO g\n'
        ) +
        '  LET f = document(from)\n' +
        '  LET t = document(to)\n' +
        '  LET doc = {"from": from, "f_addr": f.address, "f_name": f.name,\n' +
        '             "to":to, "t_addr": t.address, "t_name": t.name,\n' +
        '             "cnt":COUNT(g[*]) }\n' +
        '  SORT doc.cnt desc\n' +
        '  return doc';
    console.log(query);
    config.db.query(
        query, {
            user: uid
        }
    ).then(function (cursor) {
        logger.trace("Received cursor");
        cursor.all().then(function (values) {
            logger.trace("Unpacked cursor, length:" + values.length);

            logger.trace("Sending mapped result");
            res.send(values);
        }, function (err) {
            logger.error(err.stack);
            res.status(500).send({error: err.stack});
        })
    }, function (err) {
        logger.error(err.stack);
        res.status(500).send({error: err.stack});
    });
});

app.get('/mails', function (req, res, next) {
    logger.debug('Received query params: ');
    logger.debug(req.query);

    let uid = req.query.uid || 'users/11412795';

    let query = '' +
        'FOR m IN @@mails\n'+
        '  LIMIT 10\n'+
        '  RETURN {from: m.parts[0].sender.name, to: m.parts[0].recipients[0].name, \n' +
        '          sub: m.parts[0].subject, msg:m.parts[0].body}';
    console.log(query);
    config.db.query(
        query, {}
    ).then(function (cursor) {
        logger.trace("Received cursor");
        cursor.all().then(function (values) {
            logger.trace("Unpacked cursor, length:" + values.length);

            logger.trace("Sending mapped result");
            res.send(values);
        }, function (err) {
            logger.error(err.stack);
            res.status(500).send({error: err.stack});
        })
    }, function (err) {
        logger.error(err.stack);
        res.status(500).send({error: err.stack});
    });
});

app.get('/star', function (req, res, next) {
    logger.debug('Received query params: ');
    logger.debug(req.query);

    let uid = req.query.uid || 'users/11405029';
    let depth = parseInt(req.query.depth) || 2;
    let direction = ['INBOUND', 'OUTBOUND', 'ANY'][req.query.direction || 1];

    let query =
        'FOR s IN @@edges \n' +
        '  FILTER s._from == @user \n' +
        '  SORT s._to collect from=s._from, to=s._to INTO g \n' +
        '  LET f = document(from) \n' +
        '  LET t = document(to) \n' +
        '  LET doc = {"from": from, "f_addr": f.address, "f_name": f.name, \n' +
        '             "to":to,      "t_addr": t.address, "t_name": t.name, \n' +
        '             "cnt":COUNT(g[*]) } \n' +
        '  SORT doc.c desc \n' +
        '  RETURN doc';

    let query2 =
        'FOR vertex, edge, path IN @depth ' + direction + ' @user @@edges \n' +
        '   FILTER path.edges[0]._from==@user \n' +
        '   COLLECT from = edge._from, to=edge._to INTO g \n' +
        '   LET f = document(from) \n' +
        '   LET t = document(to) \n' +
        '   LET doc = {"from": from, "f_addr": f.address, "f_name": f.name, \n' +
        '              "to":to,      "t_addr": t.address, "t_name": t.name, \n' +
        '              "cnt":COUNT(g[*]) } \n' +
        '   SORT doc.cnt desc \n' +
        //'   LIMIT 50 \n' +
            ' FILTER doc.cnt>350\n'+
        '   RETURN doc';


    if ('star' in cache && cache['star'][uid]) {
        logger.debug("Grabbing from cache for uid " + uid);
        res.send(cache['star'][uid]);
    } else {
        logger.debug("issuing query");
        logger.trace(query2);

        config.db.query(
            query2, {
                user: uid,
                depth: depth
            }
        ).then(function (cursor) {
            logger.trace("Received cursor");
            //cursor.next())
            //.then(value => {
            //    value === 1;
            // remaining result list: [2, 3, 4, ..., 99, 100]
            //});
            cursor.all().then(function (values) {
                logger.trace("Unpacked cursor, length:" + values.length);

                let nodes = {};
                for (let run = 0; run < values.length; run++) {
                    if (!(values[run].from in nodes))
                        nodes[values[run].from] = {
                            i: Object.keys(nodes).length,
                            address: values[run].f_addr,
                            name: values[run].f_name,
                            out: 0,
                            in: 0
                        };
                    if (!(values[run].to in nodes))
                        nodes[values[run].to] = {
                            i: Object.keys(nodes).length,
                            address: values[run].t_addr,
                            name: values[run].t_name,
                            out: 0,
                            in: 0
                        };
                    nodes[values[run].from].out += values[run].cnt;
                    nodes[values[run].to].in += values[run].cnt;
                }

                if (!('star' in cache)) {
                    cache['star'] = {};
                }
                cache['star'][uid] = {
                    nodes: nodes,
                    edges: values
                };
                logger.trace("Sending mapped result");
                res.send(cache['star'][uid]);
            }, function (err) {
                logger.error(err.stack);
                res.status(500).send({error: err.stack});
            })
        }, function (err) {
            logger.error(err.stack);
            res.status(500).send({error: err.stack});
        });
    }


    //res.sendFile(config.path('maps/styles/' + config.maps.style + path));
    //res.send(path);
});

//app.use(express.static(config.path('maps/styles/osm-bright')));


module.exports = app;