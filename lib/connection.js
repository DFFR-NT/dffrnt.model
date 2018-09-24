
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
	 * Describes the `global` database `settings`.`Config` object (used for all `pool` servers).
	 * @typedef  {object}		DBConfig
	 * @property {string}		[database=mysql]			The name of the `database`.
	 * @property {string}		[user=root]					Your **MySQL** `username`.
	 * @property {string}		[password]					The `password` for the sepcified DB `user`.
	 * @property {number}		[connectionLimit=100]		The maximum amount of `connections` that can be created.
	 * @property {boolean} 		[multipleStatements=false]	If `true`, will allow multiple `statements` in one `query`.
	 * @property {boolean}		[debug=false]				If `true`, will print detailed `logs` to the console.
	 * @property {number}		[keepAlive=300000]			The interval (_in ms_) at which a `ping` will be sent to the `database`.
	 */

	/**
	 * Describes the connection info for a DB Pool `server` specified in `settings`.`Pool`.
	 * @typedef  {object}		DBServer
	 * @property {string}		[host=0.0.0.0]				The `address` of the sepcified DB `server`.
	 * @property {string}		[user=root] 				The `username` for the sepcified DB `user`.
	 * @property {string}		[password]					The `password` for the sepcified DB `user`.
	 */	

	/**
	 * Describes the collection of DBPool `servers` in `settings`.`Pool`.
	 * @typedef {Object.<string,DBServer>}	DBPool
	 */	
		
	/**
	 * Describes the `global` database `server` settings. It can be configured in the following ways:
	 * * Via a `settings` object passed directly to the `Connection` on instantiation.
	 * * Via the `database.cfg.js` file in the `/config/` folder.
	 * * If neither are found, `Connection` assumes the **local** `mysql` database on your `server`.
	 * @typedef  {object}		DBSettings
	 * @property {DBConfig}		[Config]	The `global` database settings (used for all `pool` servers).
	 * @property {DBPool}		[Pool]		A collection of settings that are specific to each `server` in the `pool`.
	 * @mixin
	 */

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
			 * @param {DBSettings} [settings={}] The database `server` `pool` settings.
			 * @constructor
			 */
			constructor(settings = {}) { 
				let conf = ({ Config, Pool } = {}) => {
					let params = (!!Config&&!!Pool?{Config,Pool}:DB),
						setngs = Assign(Defaults,params);
					CNWM.set(this, { Info: setngs, Pool: null, keptAlive: false });
				}; 	conf(settings);
			}

		/// MEMBERS ///////////////////////////////////////////////////////////////////////////////////////////

			/**
			 * Describes the `global` database `settings`.`Config` object (used for all `pool` servers).
			 * @type {DBConfig} 
			 * @memberof Connection
			 * @readonly
			 */
			get    config() { return CNWM.get(this).Info.Config; }
			/**
			 * Describes the collection of DBPool `servers` in `settings`.`Pool`.
			 * @type {DBPool} 
			 * @memberof Connection
			 * @readonly
			 */
			get   servers() { return CNWM.get(this).Info.Pool;	 }
			/**
			 * A MySQL connection `pool`
			 * @type {MySQL.PoolCluster}
			 * @memberof Connection
			 * @readonly
			 */
			get      pool() { return CNWM.get(this).Pool; 		 }
			/**
			 * Whether or not the `Connection` is being kept alive
			 * @type {boolean} 
			 * @memberof Connection
			 * @readonly
			 */
			get keptAlive() { return CNWM.get(this).keptAlive; 	 }

		/// FUNCTIONS /////////////////////////////////////////////////////////////////////////////////////////

			/**
			 * Initiates the Database `pool`.
			 * @memberof Connection
			 */
			init() {
				CNWM.get(this).Pool = MySQL.createPoolCluster();
				let { pool, servers, config } = this, keys = Object.keys(servers);
				keys.map((k, i) => pool.add(k, Assign(config, servers[k])));
				pool.on( 'error', (err) => this.log('[POOL] %s', err));
				(!this.keptAlive&&!!config.keepAlive) && this.keepAlive();
			}
			/**
			 * Sends a `ping` to the `database`, expecting a response.
			 * @memberof Connection
			 */
			ping() {
				this.pool.getConnection((err, connection) => {
					if (err) { this.log('[CONN] %s', err); this.init(); return; };
					connection.ping(); connection.release(); this.log('Ping');
				});
			}
			/**
			 * Will continually `ping` the `db` at an interval specified in the `configs`.
			 * @memberof Connection
			 */
			keepAlive() {
				let ping = this.ping.bind(this); 
				setInterval(ping, this.config.keepAlive);
				CNWM.get(this).keptAlive = true; ping();
			}
			/**
			 * Aquires a `database` connection from the `pool`.
			 *
			 * @returns {Promise} An asynchronus object of `{ error, rows }`
			 * @memberof Connection
			 */
			acquire() {
				let THS = this;
				return new Promise((resolve, reject) => {
					THS.pool.of('*').getConnection((error, connection) => {
						!!error && reject(error) || resolve({ query(...args) {
							return new Promise(resolve => {
								connection.query(...args.concat([(rer,ret) => {
									!!connection && connection.release();
									resolve({ rer: rer, ret: ret });
								}]));
							});
						}	});
					});
				});
			}
			/**
			 * Closes the `database` connection.
			 * @memberof Connection
			 */
			finish() { this.pool.end((err) => this.log('[POOL] %s', err)); }
			/**
			 * Sends out `database` logs.
			 * @param  {string} message On `success`; message is displayed _as-is_. On `error` it's used as a `sprintf`_-style_ template for `err.message`.
			 * @param  {Error} err     An `error` object; if applicable.
			 * @memberof Connection
			 */
			log(message, err) {
				if (!!err) LG.Error(err.code, 'DATABASE', message.format(err.message));
				else LG.Server(this.config.database, 'DATABASE', message, 'green');
			}
	}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EXPORTS

	module.exports = Connection;
