
'use strict';

/////////////////////////////////////////////////////////////////////////////////
// EXPORTS

	/**
	 * A collection of SQL Utilities & MySQL connector
	 * @module dffrnt.model
	 * @prop	{SQL} SQL
	 * @prop	{Connection} Connection
	 */
	module.exports = {
		SQL: 		require('./lib/sql'),
		Connection: require('./lib/connection')
	};
