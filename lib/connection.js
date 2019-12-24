/// <reference types="dffrnt.confs" />
/// <reference types="mysql" />
'use strict';

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const 	MySQL   = require('mysql');
	const { Assign, ROOTD, LG, TLS, 
			DEFINE, HIDDEN 
	}               = require('dffrnt.utils');
	const { DB }    = require('dffrnt.confs').Init();

	const L2IP 	= TLS.Lng2IP,
		  CFG 	= DB.Config,
		  KA 	= CFG.keepAlive,
		  DBs 	= DB.Pool,
		  CNWM 	= new WeakMap();

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DEFAULTS

	/** 
	 * @type {CFG.Database}
	 */
	const Defaults = {
		Queue:	5,
		Config: {
			user:               'root', // The one you created in MySQL
			database:           'mysql', // The DB
			connectionLimit:    100,
			multipleStatements: false,
			debug:              false,
			keepAlive:          300000,
		},
		Pool: 	{
			db1: 	{
				host: '0.0.0.0', // The Database IP
				password: '' // The Password one you created in MySQL
			},
		},
		Bucket: [],
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
			 * )
			 * @param {CFG.Database} settings The database `server` `pool` settings.
			 * @constructor
			 */
			constructor(settings = {}) { 
				/**
				 * ...
				 * @param {CFG.Database} config 
				 */
				let conf = ({ Config, Pool } = config = {}) => {
					let params = (!!Config&&!!Pool?{Config,Pool}:DB),
						setngs = Assign(Defaults,params);
					CNWM.set(this, { Info: setngs, Pool: null, keptAlive: false });
				}; 	
				conf(settings);
			}

		/// MEMBERS ///////////////////////////////////////////////////////////////////////////////////////////

			/**
			 * Describes the `global` database `settings`.`Queue` size.
			 * @type {number} 
			 * @memberof Connection
			 * @readonly
			 */
			get     queue() { return CNWM.get(this).Info.Queue;  }
			/**
			 * A bucket of queued connections.
			 * @type {MySQL.Connection[]} 
			 * @memberof Connection
			 * @readonly
			 */
			get    bucket() { return CNWM.get(this).Bucket;      }
			/**
			 * Describes the `global` database `settings`.`Config` object (used for all `pool` servers).
			 * @type {CFG.MSQL.Options} 
			 * @memberof Connection
			 * @readonly
			 */
			get    config() { return CNWM.get(this).Info.Config; }
			/**
			 * Describes the collection of DBPool `servers` in `settings`.`Pool`.
			 * @type {Object<string,CFG.MSQL.Pool>} 
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
				let THS = this;
				CNWM.get(THS).Pool = MySQL.createPoolCluster();
				let { pool, servers, config, queue } = THS, keys = Object.keys(servers), bucket;
				// Initialize the Pools ---------------------------------------------------------- //
					keys.map(k => pool.add(k, Assign({}, config, servers[k])));
				// Establish Event-Handlers ------------------------------------------------------ //
					pool.on(  'error', err => THS.log('[POOL] %s', err));
					pool.on('connection', con => THS.log(`[CONNECT] ${con.threadId}`));
					pool.on('acquire', con => THS.log(`[ACQUIRE] ${con.threadId}`));
					pool.on('release', con => THS.log(`[RELEASE] ${con.threadId}`));
					pool.on('enqueue', ( ) => THS.log(`[ENQUEUE]`));
				// Create the Queue-Bucket ------------------------------------------------------- //
					bucket = Array.apply(null,Array(queue)).map(v=>null);
					DEFINE(bucket, { shift: {
						enumerable:   false, writeable: false, 
						configurable: false, async value (  ) {
							let shift = Array.prototype.shift, con;
							THS.setQueue(); con = await shift.apply(this);
							THS.log(`Thread #${con.threadId} Acquired`);
							return con;
					}	}	});
					CNWM.get(THS).Bucket = bucket;
					THS.getQueue();
				// Keeps the Connection(s) alive ------------------------------------------------- //
					(!THS.keptAlive&&!!config.keepAlive) && THS.keepAlive();
			}
			/**
			 * Sends a `ping` to the `database`, expecting a response.
			 * @memberof Connection
			 */
			async ping() {
				let THS = this, bucket = THS.bucket;
				(await Promise.all(bucket)).map((c) => c.ping());
				THS.log('Ping');
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
			 * @async
			 * @returns {Promise<MySQL.PoolConnection>} The database `Connection`
			 * @memberof Connection
			 */
			getConnection() {
				let THS = this;
				return new Promise((resolve, reject) => {
					THS.pool.of('*').getConnection((error, connection) => {
						!!error && reject(error) || resolve(connection);
					});
				});
			}
			/**
			 * Fills the `Queue` with new `Connections`.
			 * @memberof Connection
			 */
			getQueue() {
				let THS = this, bucket = THS.bucket; try {
					bucket.map((v,i)=>(bucket[i]=THS.getConnection())); 
				} catch (e) { throw e; }
			}
			/**
			 * Adds a new `Connection` to the `queue`.
			 * @async
			 * @returns {boolean} `true`, if successful.
			 * @memberof Connection
			 */
			async setQueue() {
				let THS = this;
				return new Promise((resolve, reject) => { try {
					THS.bucket.push(THS.getConnection()); 
					resolve(true);
				} catch(err) { reject(err); } });
			}
			/**
			 * Aquires a `database` connection from the `queue`.
			 * @async
			 * @returns {Object<string,function>} An asynchronus object of `{ error, rows }`
			 * @memberof Connection
			 */
			async acquire() {
				let THS = this, connection = await (THS.bucket.shift());
				// Return the Connection method(s) -------------------------------------- //
					return { query(...args) {
						return new Promise((resolve, reject) => { try {
							let callback = (error, results, fields) => {
									!!connection && connection.release();
									resolve({ error, results, fields });
								};
							connection.query(...args.concat([callback]));
						} catch (err) {
							THS.log('[CONNECTION] %s', err);
							reject(err);
						} })
					}	};
			}
			/**
			 * Closes the `database` connection.
			 * @memberof Connection
			 */
			finish() { this.pool.end((err) => this.log('[POOL] %s', err)); }
			/**
			 * Sends out `database` logs.
			 * @async
			 * @param  {string} message On `success`; message is displayed _as-is_. On `error` it's used as a `sprintf`_-style_ template for `err.message`.
			 * @param  {Error?} [err]   An `error` object; if applicable.
			 * @memberof Connection
			 */
			log(message, err) {
				return new Promise(resolve => {
					if (!!err) LG.Error(err.code, 'DATABASE', message.format(err.message));
					else LG.Server(this.config.database, 'DATABASE', message, 'green');
					resolve(true);
				});
			}
	}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EXPORTS

	module.exports = Connection;
