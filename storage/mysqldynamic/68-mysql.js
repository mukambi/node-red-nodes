module.exports = function(RED) {
    "use strict";
    var reconnect = RED.settings.mysqlReconnectTime || 20000;
    var mysqldb = require('mysql2');

    function MySQLNode(n) {
        RED.nodes.createNode(this, n);
        this.host = n.host;
        this.port = n.port;
        this.tz = n.tz || "local";
        this.charset = (n.charset || "UTF8_GENERAL_CI").toUpperCase();
        this.dbname = n.db;

        this.connected = false;
        this.connecting = false;
        this.setMaxListeners(0);

        var node = this;

        function checkVer() {
            if (node.pool) {
                node.pool.query("SELECT version();", [], function(err) {
                    if (err) {
                        node.error(err);
                        node.status({ fill: "red", shape: "ring", text: RED._("mysql.status.badping") });
                        doConnect();
                    }
                });
            }
        }

        function doConnect() {
            node.connecting = true;
            node.emit("state", "connecting");
            if (!node.pool) {
                node.pool = mysqldb.createPool({
                    host: node.host,
                    port: node.port,
                    user: node.credentials.user,
                    password: node.credentials.password,
                    database: node.dbname,
                    timezone: node.tz,
                    insecureAuth: true,
                    multipleStatements: true,
                    connectionLimit: RED.settings.mysqlConnectionLimit || 50,
                    connectTimeout: 30000,
                    charset: node.charset,
                    decimalNumbers: true
                });
            }

            // Test connection
            node.pool.getConnection(function(err, connection) {
                node.connecting = false;
                if (err) {
                    node.emit("state", err.code);
                    node.error(err);
                    node.tick = setTimeout(doConnect, reconnect);
                } else {
                    node.connected = true;
                    node.emit("state", "connected");
                    if (!node.check) {
                        node.check = setInterval(checkVer, 290000);
                    }
                    connection.release();
                }
            });
        }

        node.connect = function() {
            if (!node.connected && !node.connecting) {
                doConnect();
            }
        };

        node.on("close", function(done) {
            if (node.tick) {
                clearTimeout(node.tick);
            }
            if (node.check) {
                clearInterval(node.check);
            }
            node.emit("state", " ");
            if (node.connected) {
                node.connected = false;
                node.pool.end(function() {
                    done();
                });
            } else {
                delete node.pool;
                done();
            }
        });
    }

    RED.nodes.registerType("MySQLdatabase", MySQLNode, {
        credentials: {
            user: { type: "text" },
            password: { type: "password" }
        }
    });

    function MysqlDBNodeIn(n) {
        RED.nodes.createNode(this, n);
        this.mydb = n.mydb;
        this.mydbConfig = RED.nodes.getNode(this.mydb);
        this.status({});

        if (this.mydbConfig) {
            this.mydbConfig.connect();
            var node = this;
            var busy = false;
            var status = {};

            node.mydbConfig.on("state", function(info) {
                if (info === "connecting") {
                    node.status({ fill: "grey", shape: "ring", text: info });
                } else if (info === "connected") {
                    node.status({ fill: "green", shape: "dot", text: info });
                } else {
                    node.status({ fill: "red", shape: "ring", text: info });
                }
            });

            node.on("input", function(msg, send, done) {
                send = send || function() {
                    node.send.apply(node, arguments);
                };

                const config = {
                    host: msg.host || node.mydbConfig.host,
                    port: msg.port || node.mydbConfig.port,
                    user: msg.user || node.mydbConfig.credentials.user,
                    password: msg.password || node.mydbConfig.credentials.password,
                    database: msg.database || node.mydbConfig.dbname
                };

                const connection = mysqldb.createConnection(config);

                if (typeof msg.topic === "string") {
                    connection.query(msg.topic, msg.payload || [], function(err, rows) {
                        connection.end();
                        if (err) {
                            node.error(err, msg);
                            status = { fill: "red", shape: "ring", text: RED._("mysql.status.error") + ": " + err.code };
                            node.status(status);
                            if (done) {
                                done(err);
                            }
                            return;
                        }
                        msg.payload = rows;
                        send(msg);
                        status = { fill: "green", shape: "dot", text: RED._("mysql.status.ok") };
                        node.status(status);
                        if (done) {
                            done();
                        }
                    });
                } else {
                    if (typeof msg.topic !== "string") {
                        node.error("msg.topic : " + RED._("mysql.errors.notstring"));
                        if (done) {
                            done(new Error("msg.topic must be a string"));
                        }
                    }
                }

                if (!busy) {
                    busy = true;
                    node.status(status);
                    node.tout = setTimeout(function() {
                        busy = false;
                        node.status(status);
                    }, 500);
                }
            });

            node.on("close", function() {
                if (node.tout) {
                    clearTimeout(node.tout);
                }
                node.mydbConfig.removeAllListeners();
                node.status({});
            });
        } else {
            this.error(RED._("mysql.errors.notconfigured"));
        }
    }

    RED.nodes.registerType("mysql", MysqlDBNodeIn);
};

function customQueryFormat(query, values) {
    if (!values) {
        return query;
    }
    return query.replace(/\:(\w+)/g, function(txt, key) {
        if (values.hasOwnProperty(key)) {
            return this.escape(values[key]);
        }
        return txt;
    }.bind(this));
}
