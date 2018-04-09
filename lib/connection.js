
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
			 * Instantiates a new `Connection` object. It can be configured in the following ways:
			 * * Via a `settings` object passed directly to the `Connection` on instantiation.
			 * * Via the `database.cfg.js` file in the `/config/` folder.
			 * * If neither are found, `Connection` assumes the **local** `mysql` database on your `server`.
			 *
			 * @param  {object}  [settings] 								 - The database `settings`.
			 * @param  {object}  [settings.Config] 							 - The _non-_`pool`_-specific_ settings.
			 * @param  {string}  [settings.Config.user=root] 				 - Your **MySQL** `username`.
			 * @param  {string}  [settings.Config.database=mysql]     		 - The name of the `database`.
			 * @param  {number}  [settings.Config.connectionLimit=100]		 - The maximum amount of `connections` that can be created.
			 * @param  {boolean} [settings.Config.multipleStatements=false]	 - If `true`, will allow multiple `statements` in one `query`.
			 * @param  {boolean} [settings.Config.debug=false]     			 - If `true`, will print detailed `logs` to the console.
			 * @param  {number}  [settings.Config.keepAlive=300000]     	 - The interval (_in ms_) at which a `ping` will be sent to the `database`.
			 * @param  {object}  [settings.Pool] 							 - The `pool`_-specific_ settings.
			 * @param  {object}  [settings.Pool.*=db1] 						 - A specific `pool`, denoted by the `name` (`*`) you specify.
			 * @param  {string}  [settings.Pool.*.host=0.0.0.0] 			 - The `host-address`  for the sepcified `pool`.
			 * @param  {string}  [settings.Pool.*.password] 				 - The `password` for the sepcified `pool`.
			 */
			constructor(settings) { CNWM.set(this, { Info: Assign(Defaults,settings||DB), Pool: null }); }

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
			 * Aquires a `database` connection from the `pool`.
			 * @param  {function} success A `function` to call on successful completeion.
			 * @param  {function} failure A `function` to call if it fails to connect.
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
