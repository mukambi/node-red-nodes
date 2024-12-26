const mysqldb = require('mysql2');

module.exports = function (RED) {
    const reconnect = RED.settings.mysqlReconnectTime || 20000;

    function MySQLNode(n) {
        RED.nodes.createNode(this, n);
        this.host = n.host;
        this.port = n.port;
        this.tz = n.tz || "local";
        this.charset = (n.charset || "UTF8_GENERAL_CI").toUpperCase();

        this.connected = false;
        this.connecting = false;
        this.setMaxListeners(0);
        const node = this;

        function checkVer() {
            node.pool.query("SELECT version();", [], (err, rows) => {
                if (err) {
                    node.error(err);
                    node.status({ fill: "red", shape: "ring", text: RED._("mysql.status.badping") });
                    doConnect();
                }
            });
        }

        function doConnect(msg) {
            node.connecting = true;
            node.emit("state", "connecting");

            const mysqlConfig = {
                host: msg.host || node.host,
                port: msg.port || node.port,
                user: msg.user || node.user,
                password: msg.password || node.password,
                database: msg.database || node.database,
                timezone: node.tz,
                insecureAuth: true,
                multipleStatements: true,
                connectionLimit: RED.settings.mysqlConnectionLimit || 50,
                connectTimeout: 30000,
                charset: node.charset,
                decimalNumbers: true,
            };

            node.pool = mysqldb.createPool(mysqlConfig);

            node.pool.getConnection((err, connection) => {
                node.connecting = false;
                if (err) {
                    node.emit("state", err.code);
                    node.error(err);
                    node.tick = setTimeout(() => doConnect(msg), reconnect);
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

        node.on("input", (msg, send, done) => {
            if (!node.connected) {
                doConnect(msg); // Pass the dynamic credentials
            }
            // Add query handling logic here
        });

        node.on("close", (done) => {
            if (node.check) clearInterval(node.check);
            if (node.connected) {
                node.pool.end(() => done());
            } else {
                done();
            }
        });
    }

    RED.nodes.registerType("mysql-dynamic", MySQLNode);
};
