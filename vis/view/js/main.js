function jsonReq(theUrl) {
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

class UserFilter {
    constructor() {
        this.usersearch_results = document.getElementById('usersearch_results');
        this.usersearch_input = document.getElementById('usersearch_input');

        this.uids = [];
        this.operator = 'AND';

        this.initListeners();
    }

    initListeners() {
        let that = this;
        this.usersearch_input.addEventListener("blur", function () {
            setTimeout(this.hideResults, 500)
        });
        this.usersearch_input.addEventListener("keyup", function (event) {
            if (this.value.length > 2) {
                jsonReq('http://localhost:8080/graph/users?term=' + this.value).then(that.showResults.bind(null, that));
            }
        });
    }

    showResults(that, res) {
        that.usersearch_results.style.display = 'block';
        let html = "";
        res.forEach(function (u) {
            html += '<li><a href="#" onclick="userFilter.filterUID(\'' + u['id'] + '\',\'' + u['name'] + '\',\'' + u['addr'] + '\')">' +
                u['cnt'] + ': ' + u['name'] + ' (' + u['addr'] + ')</a></li>';
        });
        that.usersearch_results.innerHTML = html;
    }

    hideResults() {
        this.usersearch_results.style.display = 'none';
    }

    filterUID(uid, name, email) {
        this.uids.push(uid);
        this.usersearch_input.value = name + ' (' + email + ')';
        this.hideResults();
        networkGraph.update();
        messageList
    }

    unfilterUID(uid) {
        let i = this.uids.indexOf(uid);
        if (i >= 0) {
            this.uids.splice(i, 1);
        }
    }

}

class MessageList {
    constructor(id) {
        this.container = document.getElementById(id);
        this.showStart();
    }

    update(mids) {
        if (!!mids) {
            jsonReq('http://localhost:8080/graph/mails?mids='+mids.join(',')).then(this.showList);
        } else if (filters.users.length === 0 && filters.entities.length === 0) {
            this.showStart()
        } else {
            // TODO: calculate list
            jsonReq('http://localhost:8080/graph/mails').then(this.showList);
        }
    }

    showList(mails) {
        if (!mails || mails.length === 0)
            this.showEmpty();
        else {
            let html = '';
            mails.forEach(function (m) {
                html += '<a href="#" class="list-group-item">' +
                    '<h4 class="list-group-item-heading">' + m['sub'] + '</h4>' +
                    '<p class="list-group-item-text">' +
                    '<i>' + m['from'] + ' - ' + m['to'] + '</i><br/>' +
                    m['msg'] +
                    '</p>' +
                    '</a>';
            });
            //TODO fix back to this.container
            document.getElementById('mail_list').innerHTML = html;
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
        this.uids = ['users/11417573', 'users/11404353', 'users/11405029', 'users/11419361'];
        this.net = undefined;
    }

    update() {
        //jsonReq("http://localhost:8080/graph/star?uid=users/11405029&depth=1&direction=2").then(function (res) {
        let that = this;

        let uid = this.uids[2];
        if (userFilter.uids.length > 0)
            uid = userFilter.uids[userFilter.uids.length - 1];

        jsonReq("http://localhost:8080/graph/graph?uid=" + uid).then(function (res) {
            console.log("received " + Object.keys(res.nodes).length + " nodes and " + res.edges.length + " edges");
            that.drawGraph(res.nodes, res.edges);

            messageList.update(res.mails);
        }).catch(function (err) {
            console.error(err.stack);
        });
    }

    drawGraph(nodes, edges) {
        if (!!this.net)
            this.net.stopSimulation();

        let v_nodes = new vis.DataSet(Object.keys(nodes).map(function (key, i) {
            let val = nodes[key];
            return {
                id: val.i, value: val.in + val.out,
                label: (val.address || 'no@mail.com') + ' - ' + (val.name || 'no name'),
                chosen: {
                    label: function (ctx, values, id) {
                        console.log(values);
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

let messageList = new MessageList('mail_list');
let userFilter = new UserFilter();
let wordCloud = new WordCloud('http://localhost:8080/graph/entities', 'wcc');
let networkGraph = new NetworkGraph();

/*
 document.getElementById('test').addEventListener('click', function(e) {
 console.log('ORG')
 woc.drawReq({types:['ORG']});
 });
 */


