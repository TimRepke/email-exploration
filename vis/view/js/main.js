class UserFilter {
    constructor() {
        this.usersearch_results = document.getElementById('usersearch_results');
        this.usersearch_input = document.getElementById('usersearch_input');

        this.initListeners();
    }

    initListeners() {
        let that = this;
        this.usersearch_input.addEventListener("blur", function () {
            setTimeout(this.hideResults, 500)
        });
        this.usersearch_input.addEventListener("keyup", function (event) {
            if (this.value.length > 2) {
                dataCenter.userSearch(this.value).then(that.showResults.bind(null, that));
            }
        });
    }

    showResults(that, res) {
        that.usersearch_results.style.display = 'block';
        let html = res.map(function (u) {
            return '<li><a href="#" onclick="userFilter.filterUID(\'' + u['id'] + '\',\'' + u['name'] + '\',\'' + u['addr'] + '\')">' +
                u['cnt'] + ': ' + u['name'] + ' (' + u['addr'] + ')</a></li>';
        }).join('\n');
        if (!html) {
            html = '<li><a href="#">No Results...</a></li>';
        }

        that.usersearch_results.innerHTML = html;
    }

    hideResults() {
        this.usersearch_results.style.display = 'none';
    }

    filterUID(uid, name, email) {
        this.usersearch_input.value = name + ' (' + email + ')';
        this.hideResults();
        dataCenter.addUser(uid);
    }

}

class MessageList {
    constructor(id) {
        this.container = document.getElementById(id);
        this.showStart();
    }

    update() {
        dataCenter.getMessages().then(this.showList);
    }

    //from: m.parts[0].sender.name, to: m.parts[0].recipients[0].name,
    //sub: m.parts[0].subject, msg:m.parts[0].body
    showList(mails) {
        console.log('message list mails: ' + mails.length);
        if (!mails || mails.length === 0)
            messageList.showEmpty();
        else {
            let html = '';
            let highlight = dataCenter.ents.length>0 ? dataCenter.ents[dataCenter.ents.length-1].e : '';
            console.log(highlight);
            mails.forEach(function (m) {
                html += '<a href="#" class="list-group-item">' +
                    '<h4 class="list-group-item-heading">' + m[0]['subject'] + '</h4>';
                m.forEach(function (p) {
                    html += '<p class="list-group-item-text">' +
                        '<i>' + p['date'] + ' <b>' + (p['sender']['name'] || p['sender']['email']) + '</b> - ' +
                        p['recipients'].map(function (r) {
                            return r['name'] || r['email'];
                        }).join(', ') + '</i><br/>' +
                        '<div style="border-left:1px solid grey; padding-left:1em">' +
                        p['body']
                            .replace(/\n/g, "<br/>")
                            .replace(new RegExp('('+highlight+')', 'gi'),'<span style="background-color:wheat; font-weight: bold;">$1</span>') + '</div>' +
                        '</p>';
                });
                html += '</a>';
            });
            messageList.container.innerHTML = html;
        }
    }

    showStart() {
        this.container.innerHTML = '<div style="margin: 0 auto; text-align: center;">' +
            '<span class="glyphicon glyphicon-send" style="font-size: 20pt"></span><br />' +
            'Start searching</div>';
    }

    showEmpty() {
        this.container.innerHTML = '<div style="margin: 0 auto; text-align: center;">' +
            '<span class="glyphicon glyphicon-phone" style="font-size: 20pt"></span><br />' +
            'No mails found!</div>'
    }
}

class NetworkGraph {
    constructor() {
        this.net = undefined;
        document.getElementById('network_stop').addEventListener('click', this.stopLayout(true));
    }

    update() {
        //jsonReq("http://localhost:8080/graph/star?uid=users/11405029&depth=1&direction=2").then(function (res) {
        let that = this;

        dataCenter.getGraph().then(function (nodes, edges) {
            that.drawGraph(nodes, edges);
        }).catch(function (err) {
            console.error(err.stack);
        });
    }

    stopLayout(asFunc) {
        let that = this;
        let func = function () {
            console.log('stop ' + !!that.net);
            if (!!that.net)
                that.net.stopSimulation();
        };
        if (asFunc) return func;
        else func();
    }

    drawGraph(ne) {
        let nodes = ne.nodes,
            edges = ne.edges;
        this.stopLayout();

        let v_nodes = new vis.DataSet(Object.keys(nodes).map(function (key, i) {
            let val = nodes[key];
            return {
                id: val.i, value: val.in + val.out,
                label: (val.address || 'no@mail.com') + ' - ' + (val.name || 'no name'),
                chosen: {
                    label: function (ctx, values, id) {
                        console.log('chosen label: ' + values);
                        values.size += 20;
                    },
                    node: true
                }
            };
        }));
        console.log('processed nodes');
        let v_edges = new vis.DataSet(edges.map(function (val, i) {
            return {
                from: nodes[val.from].i, to: nodes[val.to].i, value: val.cnt,
                arrows: {to: {enabled: true, scaleFactor: 0.5, type: 'arrow'}}
            };
        }));
        console.log('processed edges');

        // create a network
        let container = document.getElementById('graph');
        let data = {
            nodes: v_nodes,
            edges: v_edges
        };
        let options = {
            interaction: {
                hover: true
            },
            layout: {
                improvedLayout: false
            },
            physics: {
                barnesHut: {
                    avoidOverlap: 0.3,
                    "gravitationalConstant": -1500,
                    "springLength": 100,
                    "springConstant": 0.04,
                    "damping": 0.2
                },
                stabilization: {
                    iterations: 10,
                    enabled: false
                }
                //solver: 'forceAtlas2Based'
            },
            nodes: {
                shape: 'dot',
                scaling: {
                    label: {
                        min: 8,
                        max: 30
                    }
                }
            }
        };
        this.net = new vis.Network(container, data, options);
    }
}

class FilterTags {
    constructor() {
        this.container = document.getElementById('filter_tags');
    }

    update() {
        let ent = dataCenter.ents.length>0 ? dataCenter.ents[dataCenter.ents.length-1].e : 'No Entitity';
        let user = dataCenter.uids.length>0 ? dataCenter.uids[dataCenter.uids.length-1] : 'No User';
        this.container.innerHTML = '' +
            '<span class="label label-info" style="font-size:1em;" onclick="dataCenter.removeUser(undefined)">'+user+' <span class="badge">'+dataCenter.mids.user.length+'</span></span> ' +
            '<span class="label label-info" style="font-size:1em;">'+ent+' <span class="badge">'+dataCenter.mids.entities.length+'</span></span> ' +
            '<span class="badge">'+dataCenter.mids.section.length+'</span>';
    }

}

class DataCenter {
    constructor() {
        this.baseurl = 'http://localhost:8080/graph';
        this.uids = [];
        this.ents = [];

        this.mids = {
            user: [],
            entities: [],
            section: []
        }
    }

    jsonReq(theUrl) {
        return new Promise(function (resolve, reject) {
            let xmlHttp = new XMLHttpRequest();
            xmlHttp.onreadystatechange = function () {
                if (xmlHttp.readyState === 4 && xmlHttp.status === 200) {
                    resolve(JSON.parse(xmlHttp.responseText));
                } else if (xmlHttp.readyState === 4 && xmlHttp.status !== 200) {
                    reject(new Error("Received HTTP Status " + xmlHttp.status));
                }
            };
            xmlHttp.open("GET", theUrl, true); // true for asynchronous
            xmlHttp.send(null);
        });
    }

    updateMIDs() {
        let that = this;
        this.jsonReq(this.baseurl + '/mids' +
            '?uids=' + this.uids.join(',') +
            '&ents=' + this.ents.map(x => x.e).join(',')).then(function (res) {
            that.mids.user = res.user === -1 ? [] : res.user;
            that.mids.entities = res.entities === -1 ? [] : res.entities;

            that.mids.section = that.getMIDs();

            messageList.update();
            wordCloud.drawReq();
            //if(that.uids.length > 0)
            networkGraph.update();
            filterTags.update();
        });
    }

    getMIDs() {
        let u = new Set(this.mids.user),
            e = new Set(this.mids.entities);
        if (e.size > 0 && u.size > 0)
            return Array.from(new Set([...u].filter(x => e.has(x))));
        if (e.size > 0 && u.size === 0)
            return this.mids.entities;
        if (e.size === 0 && u.size > 0)
            return this.mids.user;
        return [];
        // TODO difference no filter/nothing found (?)
    }

    userSearch(term) {
        let that = this;
        return new Promise(function (resolve, reject) {
            that.jsonReq(that.baseurl + '/users?term=' + term).then(function (res) {
                resolve(res);
            }).catch(function (err) {
                reject(err);
            });
        });
    }

    addUser(uid) {
        this.uids.push(uid);
        this.updateMIDs();
    }

    addEntity(entity, type) {
        this.ents.push({e: entity, t: type});
        this.updateMIDs();
    }

    removeEntity(entity, type) {
        if (!entity && !type)
            this.ents = [];
        else {
            let i = this.ents.indexOf({e: entity, t: type});
            if (i >= 0) {
                this.ents.splice(i, 1);
            }
        }
        this.updateMIDs();
    }

    removeUser(uid) {
        if (!uid)
            this.uids = [];
        else {
            let i = this.uids.indexOf(uid);
            if (i >= 0) {
                this.uids.splice(i, 1);
            }
        }
        this.updateMIDs();
    }

    getMessages() {
        let that = this;
        return new Promise(function (resolve, reject) {
            that.jsonReq(that.baseurl + '/mails?mids=' + that.mids.section.join(',')).then(function (res) {
                resolve(res);
            }).catch(function (err) {
                reject(err);
            });
        });

    }

    getGraph() {
        let that = this;
        let uid = this.uids[this.uids.length - 1] || '';
        return new Promise(function (resolve, reject) {
            that.jsonReq(that.baseurl + '/graph?uid=' + uid+'&mids='+that.mids.section.join(',')).then(function (res) {

                console.log("received " + Object.keys(res.nodes).length + " nodes and " + res.edges.length + " edges");

                resolve({nodes: res.nodes, edges: res.edges});
            }).catch(function (err) {
                reject(err);
            })
        });

    }

    getEntities(min, types) {
        if (this.mids.section.length > 0) min = 1;
        return this.jsonReq(this.baseurl + '/entities?min_cnt=' + min + '&types=' + types.join(',') + '&mids=' + this.mids.section.join(','))
    }
}

let dataCenter = new DataCenter();
let messageList = new MessageList('mail_list');
let userFilter = new UserFilter();
let networkGraph = new NetworkGraph();
let filterTags = new FilterTags();
let wordCloud = new WordCloud('wcc');

/*
 document.getElementById('test').addEventListener('click', function(e) {
 console.log('ORG')
 woc.drawReq({types:['ORG']});
 });
 */


