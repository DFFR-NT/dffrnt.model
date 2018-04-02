
'use strict';

/////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const MySQL 					  = require('mysql');
	const { Assign, ROOTD, LG, TLS 	} = require('dffrnt.utils');
	const { DB 						} = require('dffrnt.confs');

	const CFG 	= DB.Config;
	const KA 	= CFG.keepAlive;
	const DBs 	= DB.Pool;
	const L2IP 	= TLS.Lng2IP;


/////////////////////////////////////////////////////////////////////////////////
// CLASS

	class Connection {

		constructor() { this.pool = null; }

		init() {
			this.pool = MySQL.createPoolCluster();

			Object.keys(DBs).map((k, i) => {
				this.pool.add(k, Assign(L2IP(DBs[k]), CFG));
			});
			this.pool.on( 'error', (err) => {
				LG.Error(err.code, 'DATABASE', '[POOL] %s'.format(err.message));
			});
			(!!KA) && this.keepAlive();
		}

		ping() {
			this.pool.getConnection((err, connection) => {
				if (err) {
					LG.Error(err.code, 'DATABASE', '[CONN] %s'.format(err.message));
					return;
				};
				connection.ping(); connection.release();
				LG.Server(CFG.database, 'DATABASE', 'Ping', 'green');
			});
		}

		keepAlive() {
			let ping = this.ping.bind(this);
			ping(); setInterval(ping, KA);
		}

		acquire(success, failure) {
			this.pool.of('*').getConnection((error, connection) => {
				!!error && failure(error) || success(connection);
			});
		}

		finish() {
			this.pool.end((err) => {
				!!err && LG.Error(err.code, 'DATABASE', '[END] %s'.format(err.message));
			});
		}
	}

/////////////////////////////////////////////////////////////////////////////////
// EXPORTS

	module.exports = new Connection();
