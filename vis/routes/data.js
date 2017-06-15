const express = require('express');
const path = require('path');
const parseUrl = require('parseurl');
const config = require('../utils/config');
const logger = require('../utils/logger').l('data');
let app = express();
let entities = require('./cache/entities.json');
let m2u = require('./cache/mail2users.json');
let ent_ind = require('./cache/entitiy_index.json');

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
    //logger.debug(req.query);

    let uid = req.query.uid || 'users/11412795';
    let mids = (req.query.mids || '').split(',');

    let params = {};
    let query = '' +
        'FOR m IN @@mails\n' +
        '  LIMIT 10\n' +
        '  RETURN m.parts';
    if (mids.length > 0) {
        params = {mids: mids};
        query = '' +
            'FOR m IN @@mails\n' +
            '  FILTER m._id IN @mids\n' +
           // '  LIMIT 100\n' +
            '  RETURN m.parts';
    }

    console.log(query);
    config.db.query(
        query, params
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

app.get('/users', function (req, res, next) {
    logger.debug('Received user search request');
    //logger.debug(req.query);

    let term = req.query.term || undefined;

    let query = '' +
        'FOR u IN @@nodes' +
        '   FILTER u.name LIKE CONCAT(@term,"%") OR u.address LIKE CONCAT("%", @term, "%")' +
        '   RETURN {id: u._id, name: u.name, addr: u.address, cnt: u.cnt}';

    config.db.query(
        query, {term: term}
    ).then(function (cursor) {
        logger.trace("Received cursor");
        cursor.all().then(function (values) {
            logger.trace("Unpacked cursor, length:" + values.length);
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

app.get('/mids', function(req, res, next) {
    //logger.debug(req.query);
    let ents = (req.query.ents || '').split(',').filter(x => !!x);
    let uids = (req.query.uids || '').split(',').filter(x => !!x);

    // e2m: {ent1:  [id, id,... ], ent2:  [..], ..}
    // m2e: {type1: [id, id,... ], type2: [..], ..}
    function em() {
        let em = new Set();

        ents.forEach(ent => ent_ind.e2m[ent].forEach(i => em.add(ent_ind.list[i].mid)));
        return Array.from(em);
    }

    let query = '' +
        'FOR s IN @@edges' +
        '   FILTER s._from IN @uids OR s._to IN @uids' +
        '   RETURN s.mail_ids[0]';

    if (ents.length === 0 && uids.length === 0) {
        logger.trace('/mids no selectors');
        res.send({user: -1, entities: -1});
    } else if (ents.length > 0 && uids.length === 0){
        let e = em();
        logger.trace('/mids only ents, found '+e.length);
        res.send({user: -1, entities: e});
    } else {
        config.db.query(
            query, {uids: uids}
        ).then(function (cursor) {
            cursor.all().then(function (um) {
                if (ents.length === 0 && uids.length > 0){
                    logger.trace('/mids only users, found '+um.length);
                    res.send({user: um, entities: -1});
                } else {
                    let e = em();
                    logger.trace('/mids returning '+um.length+' umids and '+e.length+' emids');
                    res.send({user: um, entities: e});
                }
            });
        }, function (err) {
            logger.error(err.stack);
            res.status(500).send({error: err.stack});
        });
    }
});

app.get('/entities', function (req, res, next) {
    logger.debug('Received query params: ');
    //logger.debug(req.query);

    /*
     'DATE': 121,
     'ORG': 99,
     'CARDINAL': 84,
     'PERSON': 81,
     'MONEY': 45,
     'GPE': 26,
     'TIME': 11,
     'NORP': 7,
     'LOC': 6,
     'ORDINAL': 3,
     'QUANTITY': 3,
     'PRODUCT': 2,
     'FAC': 1,
     'WORK_OF_ART': 1
     */
    /*
    let types = (req.query.types || 'ORG').split(',');
    let min_cnt = req.query.min_cnt || 1;

    let values = Object.values(entities.filter(function (elem) {
        return types.indexOf(elem['type']) >= 0;
    }).reduce(function (accu, e, i) {
        if (!accu[e['name']]) {
            accu[e['name']] = e;
            accu[e['name']]['cnt'] = 0;
        }
        accu[e['name']]['cnt']++;
        return accu;
    }, {})).filter(function (elem) {
        return elem['cnt'] >= min_cnt;
    });

    res.send(values);*/

    let types = (req.query.types || 'ORG').split(',').filter(x => !!x);
    let mids = (req.query.mids || '').split(',').filter(x => !!x);
    let min_cnt = req.query.min_cnt || 1;
    // {"mid":"mails/296997","entity":"Energy Market Report - 1/28/02","type":"ORG","part":0}
    let min_cnt_cnt = 0;
    let values = Object.values(ent_ind.list.filter(function (elem) {
        return types.indexOf(elem['type']) >= 0 &&
            (mids.indexOf(elem['mid']) >= 0 || mids.length === 0) &&
            !!elem['entity'];
    }).reduce(function (accu, e, i) {
        if (!accu[e['entity']]) {
            accu[e['entity']] = e;
            accu[e['entity']]['cnt'] = 0;
        }
        accu[e['entity']]['cnt']++;
        return accu;
    }, {})).filter(function (elem) {
        min_cnt_cnt++;
        return elem['cnt'] >= min_cnt;
    });
    logger.debug('Sending '+values.length+ ' unique entities ('+min_cnt_cnt+' had t<'+min_cnt+') for types: '+types.join(',')+' and mids: '+(mids.join(',')||'[]'));
    res.send(values);
});

app.get('/graph', function (req, res, next) {
    logger.debug('Received user search request');
    //logger.debug(req.query);

    let uid = req.query.uid;
    let mids = (req.query.mids || '').split(',').filter(x => !!x);

    let filters = [];
    let params = {};
    if (!!uid) {
        filters.push('(s._from IN @uids OR s._to IN @uids)');
        params['uids'] = [uid];
    }
    if (mids.length > 0) {
        filters.push('s.mail_ids[0] IN @mids');
        params['mids'] = mids;
    }
    if (filters.length === 0) {
        res.send({
            edges: [],
            nodes: [],
            mails: []
        });
        return;
    }
    let query = '' +
        'FOR s IN @@edges ' +
        '   FILTER ' + filters.join(' AND ') +
        '   LET f = document(s._from) '+
        '   LET t = document(s._to) '+
        '   RETURN {mail: s.mail_ids[0], f: s._from, t: s._to, ' +
        '           fa: f.address, fn: f.name,  ta: t.address, tn: t.name}';


    config.db.query(
        query, params
    ).then(function (cursor) {
        cursor.all().then(function (rel) {
            let ret = [];
            let nodes = {};
            let mails = {};

            rel.forEach(function (s) {
                if (!(s.mail in mails))
                    mails[s.mail] = 0;

                m2u[s.mail].forEach(function (mm) {
                    ret.push(mm);
                    if (!(mm.fi in nodes))
                        nodes[mm.fi] = {
                            i: Object.keys(nodes).length,
                            address: mm.fa,
                            name: mm.fn,
                            out: 0,
                            in: 0
                        };
                    if (!(mm.ti in nodes))
                        nodes[mm.ti] = {
                            i: Object.keys(nodes).length,
                            address: mm.ta,
                            name: mm.tn,
                            out: 0,
                            in: 0
                        };
                    nodes[mm.ti].in++;
                    nodes[mm.fi].out++;
                });
            });
            logger.trace("Unpacked cursor, length: " + ret.length);
            let edges = ret.reduce(function (acc, v, i) {
                let k = v.fi + '+' + v.ti;
                if (!(k in acc))
                    acc[k] = {
                        from: v.fi, to: v.ti, f_name: v.fn, f_addr: v.fa, t_name: v.tn, t_addr: v.ta, cnt: 0
                    };
                acc[k].cnt++;
                return acc;
            }, {});
            res.send({
                edges: Object.values(edges),
                nodes: nodes,
                mails: Object.keys(mails)
            });
        }).catch(function (err) {
            logger.error(err.stack);
            res.status(500).send({error: err.stack});
        })
    }).catch(function (err) {
        logger.error(err.stack);
        res.status(500).send({error: err.stack});
    })
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
        ' FILTER doc.cnt>350\n' +
        '   RETURN doc';

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

            logger.trace("Sending mapped result");
            res.send({
                nodes: nodes,
                edges: values
            });
        }, function (err) {
            logger.error(err.stack);
            res.status(500).send({error: err.stack});
        })
    }, function (err) {
        logger.error(err.stack);
        res.status(500).send({error: err.stack});
    });


    //res.sendFile(config.path('maps/styles/' + config.maps.style + path));
    //res.send(path);
});

app.get('/indexer_ner', function(req, res, next) {
    let raw = require('./cache/raw_ents.json'),
        m2e = {},
        e2m = {};
    //{'mid': 'mails/296997', 'entity': 'Energy Market Report', 'type': 'ORG', 'part': 0},
    raw.forEach(function(e, i) {
        if (!(e.mid in m2e)) m2e[e.mid] = {};
        if (!(e.type in m2e[e.mid])) m2e[e.mid][e.type] = [];
        if (!(e.entity in e2m)) e2m[e.entity] = [];
        // TODO make entities type sensitive

        m2e[e.mid][e.type].push(i);
        e2m[e.entity].push(i);
    });
    res.send({
        list: raw,
        m2e: m2e,
        e2m: e2m
    })
});

app.get('/indexer_graph', function (req, res, next) {
    logger.trace('start graphjs');
    let idlist_query = 'FOR s in sent ' +
        'LET f = document(s._from) ' +
        'LET t = document(s._to) ' +
        'RETURN {m: s.mail_ids[0], fn: f.name, fa: f.address, tn: t.name, ta: t.address, ti:s._to, fi:s._from}';

    config.db.query(
        idlist_query, {}
    ).then(function (cursor) {
        logger.trace('promises arrived');
        cursor.all().then(function (all) {
            let m = all.reduce(function (acc, s, i) {
                if (!(s.m in acc))
                    acc[s.m] = [];
                acc[s.m].push({'i': i, fn: s.fn, fa: s.fa, tn: s.tn, ta: s.ta, ti: s.ti, fi: s.fi});
                return acc;
            }, {});
            res.send(m);
        }).catch(function (err) {
            logger.error(err.stack);
            res.status(500).send({error: err.stack});
        })
    }).catch(function (err) {
        logger.error(err.stack);
        res.status(500).send({error: err.stack});
    })
});

//app.use(express.static(config.path('maps/styles/osm-bright')));


module.exports = app;