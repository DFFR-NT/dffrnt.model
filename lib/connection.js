
'use strict';

const MySQL = require('mysql');
const ROOTD = require('app-root-path');
const DB 	= require(ROOTD+'/config/database.js');

function Connection () {
	var THS = this, L2IP = TLS.Lng2IP,
		CFG = DB.Config, DBs = DB.Pool;

	THS.pool = null;

	THS.init = function init () {
		THS.pool = MySQL.createPoolCluster();

		Object.keys(DBs).map(function (k, i) {
			console.log('DB:', Assign(L2IP(DBs[k]), CFG))
			THS.pool.add(k, Assign(L2IP(DBs[k]), CFG));
		});
		THS.pool.on( 'error', 	function (err) {
			LG.Error(err.code, 'DATABASE', '[POOL] %s'.format(err.message));
		});
		THS.keepAlive();
	};

	THS.keepAlive = function keepAlive () {
		function ping () {
			console.log('trying...')
			THS.pool.getConnection(function (err, connection) {
				if (err) {
					LG.Error(err.code, 'DATABASE', '[CONN] %s'.format(err.message));
					return;
				};
				connection.ping(); connection.release();
				LG.Server(CFG.database, 'DATABASE', 'Ping', 'green');
			});
		};	ping();
		setInterval(ping, 300000);
	}

	THS.acquire = function acquire (success, failure) {
		THS.pool.of('*').getConnection(function (error, connection) {
			!!error && failure(error) || success(connection);
		});
	};

	THS.finish = function finish () {
		THS.pool.end(function (err) {
			!!err && LG.Error(err.code, 'DATABASE', '[END] %s'.format(err.message));
		});
	};
}

module.exports = new Connection();
