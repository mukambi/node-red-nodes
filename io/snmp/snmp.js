
module.exports = function(RED) {
    "use strict";
    var snmp = require("net-snmp");

    function SnmpNode(n) {
        RED.nodes.createNode(this,n);
        this.community = n.community;
        this.host = n.host;
        this.version = (n.version === "2c") ? snmp.Version2c : snmp.Version1;
        this.oids = n.oids.replace(/\s/g,"");
        var node = this;

        this.on("input",function(msg) {
            var oids = node.oids || msg.oid;
            if (oids) {
                if (msg.host && node.host || msg.community && node.community) {
                    node.warn(RED._("common.errors.nooverride"));
                }
                var host = node.host || msg.host;
                var community = node.community || msg.community;
                node.session = snmp.createSession(host, community, {version: node.version});
                node.session.get(oids.split(","), function(error, varbinds) {
                    if (error) {
                        node.error(error.toString(),msg);
                    }
                    else {
                        for (var i = 0; i < varbinds.length; i++) {
                            if (snmp.isVarbindError(varbinds[i])) {
                                node.error(snmp.varbindError(varbinds[i]),msg);
                            }
                            else {
                                if (varbinds[i].type == 4) { varbinds[i].value = varbinds[i].value.toString(); }
                                varbinds[i].tstr = snmp.ObjectType[varbinds[i].type];
                                //node.log(varbinds[i].oid + "|" + varbinds[i].tstr + "|" + varbinds[i].value);
                            }
                        }
                        msg.oid = oids;
                        msg.payload = varbinds;
                        node.send(msg);
                    }
                });
            }
            else {
                node.warn("No oid(s) to search for");
            }
        });

        this.on("close", function() {
            if (node.session) {
                node.session.close();
            }
        });
    }
    RED.nodes.registerType("snmp",SnmpNode);

    function SnmpTNode(n) {
        RED.nodes.createNode(this,n);
        this.community = n.community;
        this.host = n.host;
        this.version = (n.version === "2c") ? snmp.Version2c : snmp.Version1;
        this.oids = n.oids.replace(/\s/g,"");
        var node = this;
        var maxRepetitions = 20;

        function sortInt(a, b) {
            if (a > b) { return 1; }
            else if (b > a) { return -1; }
            else { return 0; }
        }

        this.on("input",function(msg) {
            var oids = node.oids || msg.oid;
            if (oids) {
                msg.oid = oids;
                if (msg.host && node.host || msg.community && node.community) {
                    node.warn(RED._("common.errors.nooverride"));
                }
                var host = node.host || msg.host;
                var community = node.community || msg.community;
                node.session = snmp.createSession(host, community, {version: node.version});
                node.session.table(oids, maxRepetitions, function(error, table) {
                    if (error) {
                        node.error(error.toString());
                    }
                    else {
                        var indexes = [];
                        for (var index in table) {
                            if (table.hasOwnProperty(index)) {
                                indexes.push(parseInt(index));
                            }
                        }
                        indexes.sort(sortInt);
                        for (var i = 0; i < indexes.length; i++) {
                            var columns = [];
                            for (var column in table[indexes[i]]) {
                                if (table[indexes[i]].hasOwnProperty(column)) {
                                    columns.push(parseInt(column));
                                }
                            }
                            columns.sort(sortInt);
                            // console.log("row index = " + indexes[i]);
                            // for (var j = 0; j < columns.length; j++) {
                            //     console.log("  column " + columns[j] + " = " + table[indexes[i]][columns[j]]);
                            // }
                        }
                        msg.payload = table;
                        node.send(msg);
                    }
                });
            }
            else {
                node.warn("No oid to search for");
            }
        });

        this.on("close", function() {
            if (node.session) {
                node.session.close();
            }
        });
    }
    RED.nodes.registerType("snmp table",SnmpTNode);

    function SnmpSubtreeNode(n) {
        RED.nodes.createNode(this,n);
        this.community = n.community;
        this.host = n.host;
        this.version = (n.version === "2c") ? snmp.Version2c : snmp.Version1;
        this.oids = n.oids.replace(/\s/g,"");
        var node = this;
        var maxRepetitions = 20;
        var response = [];

        function feedCb(varbinds) {
            for (var i = 0; i < varbinds.length; i++) {
                if (snmp.isVarbindError(varbinds[i])) {
                    node.error(snmp.varbindError(varbinds[i]));
                }
                else {
                    //console.log(varbinds[i].oid + "|" + varbinds[i].value);
                    response.push({oid: varbinds[i].oid, value: varbinds[i].value});
                }
            }
        }

        this.on("input",function(msg) {
            var oids = node.oids || msg.oid;
            if (oids) {
                msg.oid = oids;
                if (msg.host && node.host || msg.community && node.community) {
                    node.warn(RED._("common.errors.nooverride"));
                }
                var host = node.host || msg.host;
                var community = node.community || msg.community;
                node.session = snmp.createSession(host, community, {version: node.version});
                node.session.subtree(msg.oid, maxRepetitions, feedCb, function(error) {
                    if (error) {
                        node.error(error.toString());
                    }
                    else {
                        msg.payload = response;
                        node.send(msg);
                        //Clears response
                        response.length = 0;
                    }
                });
            }
            else {
                node.warn("No oid to search for");
            }
        });

        this.on("close", function() {
            if (node.session) {
                node.session.close();
            }
        });
    }
    RED.nodes.registerType("snmp subtree",SnmpSubtreeNode);

    function SnmpWalkerNode(n) {
        RED.nodes.createNode(this,n);
        this.community = n.community;
        this.host = n.host;
        this.version = (n.version === "2c") ? snmp.Version2c : snmp.Version1;
        this.oids = n.oids.replace(/\s/g,"");
        var node = this;
        var maxRepetitions = 20;
        var response = [];

        function feedCb(varbinds) {
            for (var i = 0; i < varbinds.length; i++) {
                if (snmp.isVarbindError(varbinds[i])) {
                    node.error(snmp.varbindError(varbinds[i]));
                }
                else {
                    //console.log(varbinds[i].oid + "|" + varbinds[i].value);
                    response.push({oid: varbinds[i].oid, value: varbinds[i].value});
                }
            }
        }

        this.on("input",function(msg) {
            node.msg = msg;
            var oids = node.oids || msg.oid;
            if (oids) {
                msg.oid = oids;
                if (msg.host && node.host || msg.community && node.community) {
                    node.warn(RED._("common.errors.nooverride"));
                }
                var host = node.host || msg.host;
                var community = node.community || msg.community;
                node.session = snmp.createSession(host, community, {version: node.version});
                node.session.walk(msg.oid, maxRepetitions, feedCb, function(error) {
                    if (error) {
                        node.error(error.toString());
                    }
                    else {
                        msg.payload = response;
                        node.send(msg);
                        //Clears response
                        response.length = 0;
                    }
                });
            }
            else {
                node.warn("No oid to search for");
            }
        });

        this.on("close", function() {
            if (node.session) {
                node.session.close();
            }
        });
    }
    RED.nodes.registerType("snmp walker",SnmpWalkerNode);
};
