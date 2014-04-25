/**
 * Copyright 2013 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var orig=console.warn;
console.warn=(function() { // suppress warning from stringprep when not needed)
    var orig=console.warn;
    return function() {
    //orig.apply(console, arguments);
    };
})();

try {
    var xmppkey = RED.settings.xmpp || require(process.env.NODE_RED_HOME+"/../xmppkeys.js");
} catch(err) {
//    throw new Error("Failed to load XMPP credentials");
}

var RED = require(process.env.NODE_RED_HOME+"/red/red");
var xmpp = require('simple-xmpp');
console.warn = orig;

function XMPPServerNode(n) {
    RED.nodes.createNode(this,n);
    this.server = n.server;
    this.port = n.port;
    var credentials = RED.nodes.getCredentials(n.id);
    if (credentials) {
        this.username = credentials.user;
        this.password = credentials.password;
    }  
}
RED.nodes.registerType("xmpp-server",XMPPServerNode);

var querystring = require('querystring');

RED.httpAdmin.get('/xmpp-server/:id',function(req,res) {
    var credentials = RED.nodes.getCredentials(req.params.id);
    if (credentials) {
        res.send(JSON.stringify({user:credentials.user,hasPassword:(credentials.password&&credentials.password!="")}));
    } else {
        res.send(JSON.stringify({}));
    }
});

RED.httpAdmin.delete('/xmpp-server/:id',function(req,res) {
    RED.nodes.deleteCredentials(req.params.id);
    res.send(200);
});

RED.httpAdmin.post('/xmpp-server/:id',function(req,res) {
    var body = "";
    req.on('data', function(chunk) {
        body+=chunk;
    });
    req.on('end', function(){
        var newCreds = querystring.parse(body);
        var credentials = RED.nodes.getCredentials(req.params.id)||{};
        if (newCreds.user == null || newCreds.user == "") {
            delete credentials.user;
        } else {
            credentials.user = newCreds.user;
        }
        if (newCreds.password == "") {
            delete credentials.password;
        } else {
            credentials.password = newCreds.password||credentials.password;
        }
        RED.nodes.addCredentials(req.params.id,credentials);
        res.send(200);
    });
});


function XmppNode(n) {
    RED.nodes.createNode(this,n);
    this.server = n.server;
    this.serverConfig = RED.nodes.getNode(this.server);
    if (this.serverConfig){
        this.host = this.serverConfig.server;
        this.port = this.serverConfig.port;
        this.jid = this.serverConfig.username;
        this.password = this.serverConfig.password;
    } else {
        console.log("no serverConfig found");
    }

    this.join = n.join || false;
    this.nick = n.nick || "Node-RED";
    this.sendAll = n.sendObject;
    this.to = n.to || "";
    var node = this;

    setTimeout(function() {
        xmpp.connect({
            jid         : node.jid,
            password    : node.password,
            host        : node.host,
            port        : node.port,
            skipPresence : true,
            reconnect : false
        });
    }, 5000);

    xmpp.on('online', function() {
        node.log('connected to '+node.server);
        xmpp.setPresence('online', node.nick+' online');
        if (node.join) {
            xmpp.join(node.to+'/'+node.nick);
        }
    });

    xmpp.on('chat', function(from, message) {
        var msg = { topic:from, payload:message };
        node.send([msg,null]);
    });

    xmpp.on('groupchat', function(conference, from, message, stamp) {
        var msg = { topic:from, payload:message, room:conference };
        if (from != node.nick) { node.send([msg,null]); }
    });

    //xmpp.on('chatstate', function(from, state) {
        //console.log('%s is currently %s', from, state);
        //var msg = { topic:from, payload:state };
        //node.send([null,msg]);
    //});

    xmpp.on('buddy', function(jid, state, statusText) {
        node.log(jid+" is "+state+" : "+statusText);
        var msg = { topic:jid, payload: { presence:state, status:statusText} };
        node.send([null,msg]);
    });

    xmpp.on('error', function(err) {
        console.error(err);
    });

    xmpp.on('close', function(err) {
        node.log('connection closed');
    });

    xmpp.on('subscribe', function(from) {
        xmpp.acceptSubscription(from);
    });

    this.on("input", function(msg) {
        var to = msg.topic;
        if (node.to != "") { to = node.to; }
        if (node.sendAll) {
            xmpp.send(to, JSON.stringify(msg), node.join);
        }
        else {
            xmpp.send(to, msg.payload, node.join);
        }
    });

    this.on("close", function() {
        xmpp.setPresence('offline');
        try {
            xmpp.disconnect();
        // TODO - DCJ NOTE... this is not good. It leaves the connection up over a restart - which will end up with bad things happening...
        // (but requires the underlying xmpp lib to be fixed, which does have an open bug request on fixing the close method - and a work around.
        // see - https://github.com/simple-xmpp/node-simple-xmpp/issues/12 for the fix
        } catch(e) {
            this.warn("Due to an underlying bug in the xmpp library this does not disconnect old sessions. This is bad... A restart would be better.");
        }
    });
}

RED.nodes.registerType("xmpp",XmppNode);
