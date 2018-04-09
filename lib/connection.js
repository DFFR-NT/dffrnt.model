
'use strict';

/////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const MySQL 					  = require('mysql');
	const { Assign, ROOTD, LG, TLS 	} = require('dffrnt.utils');
	const { DB 						} = require('dffrnt.confs');

	const L2IP 	= TLS.Lng2IP,
		  CFG 	= DB.Config,
		  KA 	= CFG.keepAlive,
		  DBs 	= DB.Pool;


/////////////////////////////////////////////////////////////////////////////////
// DEFAULTS

	/**
	 * These are `configs` the `Connection` instance will use. They can be set in `/config/database.cfg.js`.
	 * @prop {object}  Config 					 - The non-`pool`-specific configs
	 * @prop {string}  Config.user 				 - Your **MySQL** `username`
	 * @prop {string}  Config.database     		 - The name of the `database`
	 * @prop {number}  Config.connectionLimit	 - The maximum amount of `connections` that can be created
	 * @prop {boolean} Config.multipleStatements - If `true`, will allow multiple `statements` in one `query`
	 * @prop {boolean} Config.debug     		 - If `true`, will print detailed `logs` to the console
	 * @prop {number}  Config.keepAlive     	 - The interval at which a `ping` will be sent to the `database`
	 * @prop {object}  Pool 					 - The `pool`-specific configs
	 * @prop {number}  Pool.\[poolname\] 		 - A specific `pool`, denoted by the `[poolname]` you specify
	 * @prop {number}  Pool.\[poolname\].host 	 - The `host-address`  for the sepcified `pool`
	 * @prop {number}  Pool.\[poolname\].password  - The `password` for the sepcified `pool`
	 */
	const Database = {
		Config: {
			user:               '', // The one you created in MySQL
			database:           '', // The DB
			connectionLimit:    100,
			multipleStatements: false,
			debug:              false,
			keepAlive:          300000
		},
		Pool: {
			poolname: {
				host: '0.0.0.0', // The Database IP
				 // The Password one you created in MySQL
				password: ''
			},
		}
	};


/////////////////////////////////////////////////////////////////////////////////
// CLASS

	/**
	 * Creates a new `MySQL` Connection Pool.
	 */
	class Connection {

		/**
		 * Instantiates a new `Connection` object
		 */
		constructor() { this.pool = null; }
		/**
		 * Initiates the `Database Pool`
		 */
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
		/**
		 * Sends a `ping` to the `database`, expecting a response
		 */
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
		/**
		 * Will continually `ping` the `db` at an interval specified in the `configs`
		 */
		keepAlive() {
			let ping = this.ping.bind(this);
			ping(); setInterval(ping, KA);
		}
		/**
		 * Aquires a `database` connection from the `pool`
		 * @param  {function} success A `function` to call on successful completeion
		 * @param  {function} failure A `function` to call if it fails to connect
		 */
		acquire(success, failure) {
			this.pool.of('*').getConnection((error, connection) => {
				!!error && failure(error) || success(connection);
			});
		}
		/**
		 * Closes the `database` connection
		 */
		finish() {
			this.pool.end((err) => {
				!!err && LG.Error(err.code, 'DATABASE', '[END] %s'.format(err.message));
			});
		}
	}

/////////////////////////////////////////////////////////////////////////////////
// EXPORTS

	module.exports = new Connection();
