
'use strict';

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const MySQL 					  = require('mysql');
	const { Assign, ROOTD, LG, TLS 	} = require('dffrnt.utils');
	const { DB 						} = require('dffrnt.confs');

	const L2IP 	= TLS.Lng2IP,
		  CFG 	= DB.Config,
		  KA 	= CFG.keepAlive,
		  DBs 	= DB.Pool,
		  CNWM 	= new WeakMap();

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DEFAULTS

	const Defaults = {
		Config: {
			user:               'root', // The one you created in MySQL
			database:           'mysql', // The DB
			connectionLimit:    100,
			multipleStatements: false,
			debug:              false,
			keepAlive:          300000
		},
		Pool: {
			db1: {
				host: '0.0.0.0', // The Database IP
				password: '' // The Password one you created in MySQL
			},
		}
	};


///////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CLASS

	/**
	 * Creates a new `MySQL` Connection Pool.
	 */
	class Connection {

		/// CONSTRUCTOR ///////////////////////////////////////////////////////////////////////////////////////

			/**
			 * Describes the `global` database `settings`.`Config` object (used for all `pool` servers).
			 * @typedef  {object}	DBConfig
			 * @property {string}	[database=mysql]			 - The name of the `database`.
			 * @property {string}	[user=root]					 - Your **MySQL** `username`.
			 * @property {string}	[password]					 - The `password` for the sepcified DB `user`.
			 * @property {number}	[connectionLimit=100]		 - The maximum amount of `connections` that can be created.
			 * @property {boolean} 	[multipleStatements=false]	 - If `true`, will allow multiple `statements` in one `query`.
			 * @property {boolean}	[debug=false]				 - If `true`, will print detailed `logs` to the console.
			 * @property {number}	[keepAlive=300000]			 - The interval (_in ms_) at which a `ping` will be sent to the `database`.
			 */

			/**
			 * Describes the connection info for a DB Pool `server` specified in `settings`.`Pool`.
			 * @typedef  {object}	DBServer
			 * @property {string}	[host=0.0.0.0]				 - The `address` of the sepcified DB `server`.
			 * @property {string}	[user=root] 				 - The `username` for the sepcified DB `user`.
			 * @property {string}	[password]					 - The `password` for the sepcified DB `user`.
			 */

			/**
			 * Instantiates a new `Connection` object. It can be configured in the following ways:
			 * * Via a `settings` object passed directly to the `Connection` on instantiation.
			 * * Via the `database.cfg.js` file in the `/config/` folder.
			 * * If neither are found, `Connection` assumes the **local** `mysql` database on your `server`.
			 *
			 * @param  {object}   	[settings] 					 - The `database` & `pool` settings.
			 * @param  {DBConfig} 	[settings.Config]			 - The `global` database settings (used for all `pool` servers).
			 * @param  {DBServer[]} [settings.Pool] 			 - A collection of settings that are specific to each `server` in the `pool`.
			 */
			constructor({ Config, Pool } = {}) {
				let params = (!!Config&&!!Pool?{Config,Pool}:DB),
					setngs = Assign(Defaults,params);
				CNWM.set(this, { Info: setngs, Pool: null });
			}

		/// MEMBERS ///////////////////////////////////////////////////////////////////////////////////////////

			get  config() { return CNWM.get(this).Info.Config; 	}
			get servers() { return CNWM.get(this).Info.Pool; 	}
			get    pool() { return CNWM.get(this).Pool; 		}

		/// FUNCTIONS /////////////////////////////////////////////////////////////////////////////////////////

			/**
			 * Initiates the Database `pool`.
			 */
			init() {
				CNWM.get(this).Pool = MySQL.createPoolCluster();
				let { pool, servers, config } = this, keys = Object.keys(servers);
				keys.map((k, i) => pool.add(k, Assign(config, servers[k])));
				pool.on( 'error', (err) => this.log('[POOL] %s', err));
				(!!config.keepAlive) && this.keepAlive();
			}
			/**
			 * Sends a `ping` to the `database`, expecting a response.
			 */
			ping() {
				this.pool.getConnection((err, connection) => {
					if (err) { this.log('[CONN] %s', err); return; };
					connection.ping(); connection.release(); this.log('Ping');
				});
			}
			/**
			 * Will continually `ping` the `db` at an interval specified in the `configs`.
			 */
			keepAlive() {
				let ping = this.ping.bind(this); ping();
				setInterval(ping, this.config.keepAlive);
			}
			/**
			 * A `callback` to handle the **MySQL** connection `pool` that was successfully acquired.
			 *
			 * @callback CBsuccess
			 * @param {mysql.Connection} con - The **MySQL** `connection`
			 */
			/**
			 * A `callback` to handle the failure to aquire a **MySQL** connection `pool`.
			 *
			 * @callback CBfailure
			 * @param {error} err - An `error` object describing the failure
			 */
			/**
			 * Aquires a `database` connection from the `pool`.
			 * @param  {CBsuccess} success - A `callback` to handle the **MySQL** connection `pool` that was successfully acquired.
			 * @param  {CBfailure} failure - A `callback` to handle the failure to aquire a **MySQL** connection `pool`.
			 */
			acquire(success, failure) {
				this.pool.of('*').getConnection((error, connection) => {
					!!error && failure(error) || success(connection);
				});
			}
			/**
			 * Closes the `database` connection.
			 */
			finish() { this.pool.end((err) => this.log('[POOL] %s', err)); }
			/**
			 * Sends out `database` logs.
			 * @param  {string} message On `success`; message is displayed _as-is_. On `error` it's used as a `sprintf`_-style_ template for `err.message`.
			 * @param  {object} err     An `error` object; if applicable.
			 */
			log(message, err) {
				if (!!err) LG.Error(err.code, 'DATABASE', message.format(err.message));
				else LG.Server(this.config.database, 'DATABASE', message, 'green');
			}
	}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EXPORTS

	module.exports = Connection;
