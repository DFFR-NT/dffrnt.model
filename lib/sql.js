
'use strict';

/////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const assert = require('assert');
	const {
		Assign, Imm, NIL, UoN, IaN, IS, ISS, DCT, TYPE,
		RGX, FRMT, ELOGR, Dbg, LG, TLS, JSN, EPROXY
	} = require('dffrnt.utils');

/////////////////////////////////////////////////////////////////////////////////////////////
// CONSTANTS

	const encl = { mch: /^(.+?),?$/, arr: '[$1]', obj: '{$1}' };
	const lstx = { mch: /((?:[\/\w]+([;&]|))+)/, rep: '[$1]' };
	const quox = { mch: /([\/\w]+)/g, rep: '"$1"' };
	const numx = { mch: /"(\d+(?:\.\d+)?|true|false)"/g, rep: '$1' };
	const regx = {
		mch: /^((?:\/\w+)+|\/|$)((?:\/?(?::\w+:[^\/?]*?))+|)(?:(\?(?:\w+=([^&=?]||\\[&=?])+&?)+|))$/,
		pnt: { rep: '"$2",', 	  mch: /(\/(\w+)|^\/$)/g 									},
		prm: { rep: '"$2":"$3",', mch: /(\/:(\w+):((?:[^\/&=?\s]+;?|%s|)+(?=\/:|\?|)))/g 	},
		qry: { rep: '"$2":"$3",', mch: /(\??(\w+)=([^\/&\s]+)(?:&|$))/g 					},
		brk: { rep: '$1',   	  mch: /"(\[.*?\]|\{.*?\})"/g 								},
		esc: { rep: '$1',   	  mch: /\\+([&=?])/g 										},
	};
	const conx = {
		dlm: '<|>',
		esc: {  mch: /(^|[^\\])(")/g, rep: function (slash) {
			return function ($0, $1, $2) { return $1+slash+$2; }
		}	},
		col: { 	mch: /(%s)/g, rep: function (cols, i) {
			var d = conx.dlm; return function ($0, $1) { i++; return "'"+d+cols[i]+d+"'"; }
		}	}
	};
	const optx = { link: "/", columns: null, escapes: 1 };
	const defx = { point: [""], params: {}, query: {} };
	const dfsx = JSON.stringify(defx);

/////////////////////////////////////////////////////////////////////////////////////////////
// CLASS.QRY

	/// CONSTANTS ///////////////////////////////////////////////////////////////////////////

		const 	SQL_KWRD = {};
		const 	SQL_CLRS = {
					green:   /(:\w+:)/g,
					cyan: 	 { '$':2, '/':/((?:FROM|\w+ JOIN|INTO|UPDATE)\s+(?=\w))(\w+)/g },
					yellow:  { '$':2, '/':/(")(\S(?:\\(?=")|[^"])*)(")/g },
					magenta: { '$':2, '/':/([(\s,])(\d+(?=[\s,)]))/g },
					blue: 	 { '$':2, '/':/(AS\s+| |\b(?=[A-Z]))(\w(?=\.|\nINNER|\nFULL|\nLEFT|\nRIGHT| )|[A-Z]+(?=\())(|\()/g },
					grey: 	 { '$':2, '/':/((?:\b|[')"])(?=[<.;,>]))([<.;,>]+)/g },
					red: 	 (
						"/(\\B=\\B|\\b(?:(?:SELECT|INSERT)(?:\\s+INTO)?|UPDATE|SET|VALUES|" +
						"DELETE|FROM|(?:INNER|OUTER|FULL|LEFT|RIGHT)\\s+JOIN|AS|WHERE|" +
						"ON|AND|OR|NULL|LIKE|RLIKE|IN|IS|NOT|BETWEEN|" +
						"(?:GROUP|ORDER) BY|LIMIT|OFFSET|UNION(?: ALL)?)\\b)/gi"
					),
				};
		const 	SQL_TABS = {
					delimiter: 	'\t',
					suffix: 	false,
					align: 		{ 3: '+' },
					border: 	null,
					callback  	(v) {
						var res =  v.align('\\.', '-').align("',?", '-');
						return res;
					},
					debug: 		false,
				};
		const 	SQL_RETR = (rets = [], use = [], omits = [])=>{
					let retr; omits = (omits||[]);
					retr = (use||[]).filter(v=>!omits.has(v));
					return (rets||[]).concat(retr);
				};
		const 	SQL_OMTS = {
					UNI: ["GRP","ORD","LMT"],
					WHR: ["WHR","ON"],
					OFS: ["OFS"],
				};
		const 	SQL_RETS = {
					RGT(         ) { return SQL_RETR(); },
					SLC(rets,omit) { return SQL_RETR(rets,["SLC"],omit); },
					CMP(rets,omit) { return SQL_RETR(rets, [
						"EQ","NE","GT","LT","GE","LE","IN",
						"EX","LK","RL","RX","IS","NOT","BT",
					], omit); },
					JNS(rets,omit) { return SQL_RETR(rets,["JOIN"].concat(SQL_OMTS.WHR),omit); },
					CND(rets,omit) { return SQL_RETR(rets,["AND","OR"],omit); },
					OTH(rets,omit) { return SQL_RETR(rets,["UNI"].concat(SQL_OMTS.UNI),omit); },
				};
		const 	SQL_FRMT = new FRMT({
					'KEYWORD': 	"%|^/U|s",
					'COLUMNS': 	"%[%!s|;/,\\n\t]s",
					'TABLES':  	"%!{%!(k)r%!(v<<ALIAS,EXT,JOINS>>)s}s",
					'TTYPES':  	"%!([FROM,JOIN,INNER JOIN,LEFT JOIN,RIGHT JOIN,FULL JOIN,OUTER JOIN])s",
					'ALIAS': 	"%!(AS|-/\t%s\t|+/\t \t)s",
					'EXT': 		"%!(DB|-/\tIN\t)s",
					'JOINS': 	"%!(CLS<<ONS>>)s",
					'ONS': 		"%!{%!(k<<DOT>>)s\t%!(v<<CLAUSES>>)s}s",
					'INTO': 	"%[%!s|;/, |-/(|+/)//]s",
					'VALUES':  	"%[%r|;/, |-/(|+/)//]s",
					'SET': 		"%!{%!(k<<DOT>>)s\t%(=)s\t%!(v)r|;/,\\n \t}s ",
					'COMPARE': 	"%!{%!(k|-/\t|+/\t)s%!(v|-/\t)s}s",
					'CLAUSES': 	"%!{%!(k<<DOT>>)r%!(v<<OPS>>)s}s",
					'OPS': 		"%!([WHERE,ON,AND,OR,=,<>,>,<,>=,<=,LIKE,RLIKE,REGEXP,IN,IS,IS NOT,NOT LIKE,NOT RLIKE,NOT REGEXP,NOT IN,BETWEEN]|-/\t%s\t)r",
					'LIST':		"%[%s|#/>2|;/, \\n\t]s",
					'STRING': 	"%r",
					'DOT': 		"%s",
				}, ['']);
		const 	SQL_ACTS = Imm.List(['INSERT', 'SELECT', 'UPDATE', 'DELETE']);

	/**
	 * Creates `SQL` queries with integrity in mind
	 * @extends module:dffrnt.utils/EPROXY
	 */
	class QRY extends EPROXY {
		/// QRY.PUBLISH /////////////////////////////////////////////////////////////////////

			/**
			 * Creates an instance of QRY.
			 * @param {boolean} [debug=false] A flag for Debugging purposes
			 */
			constructor(debug = false) {
				super({ 
					/**
					 * Restricts the `QRY` chain depending on the last action
					 * @param {QRY} target The `get` instance
					 * @param {string|number|symbol} name The property to `get`
					 * @param {Proxy} receiver Either the proxy or an object that inherits from the proxy
					 * @returns {any} The property; if found
					 * @memberof QRY.prototype
					 * @ignore
					 */
					get(target, name, receiver) {
						let ret; try { if (target.isKEYWORD(name)) 
							switch (true) {
								case target.isGET(name): break;;
								case !target.isKEYFUNC(name): 
									return (...args)=>target.newDynamic(name,...args);
								default: target.notAllowed(name); break;;
							}; return Reflect.get(target, name, receiver);
						} catch (e) { 
							(e instanceof QueryError) && console.log(e); 
						}
					},
				});
				this.allowed = ["INS","SLC","UPD","DEL"];
				this.temp 	 = { TMP: [], VAL: [], RET: {} };
				this.action  = ""; 
				this.conditions  = "";
				this.debug 	 = debug;
			}

		/// QRY.CONSTANTS ///////////////////////////////////////////////////////////////////

			/** @private */
			get KeyWords() { return SQL_KWRD; }
			/** @private */
			get Colors  () { return SQL_CLRS; }
			/** @private */
			get Tabs  	() { return SQL_TABS; }
			/** @private */
			get Format  () { return SQL_FRMT; }
			/** @private */
			get Acts  	() { return SQL_ACTS; }

		/// QRY.VARIABLES ///////////////////////////////////////////////////////////////////

			/** 
			 * @type {Object.<string,DCT>}
			 * @private 
			 */
			get Args  	()    { let V = this.temp.VAL; return V[V.length-1]; }
			set Args  	(val) { this.temp.VAL.push(this.newState(val)); }
			/**
			 * @type {Object.<string,array>}
			 * @private
			 */
			get Rets  	()    { return this.temp.RET; }
			set Rets  	(val) { let T = this.temp; 
				T.RET = Imm .Map(T.RET).delete('ACT')
							.merge(Imm.Map(this.newRet(val)))
							.toObject(); }
			/**
			 * @type {string}
			 * @private
			 */
			get Frmt  	()    { return this.temp.TMP.join(""); }
			set Frmt  	(val) { this.temp.TMP.push(this.newTemp(val)); }
			/**
			 * @type {string}
			 * @private
			 */
			get Action 	()    { return this.action; }
			set Action 	(val) { this.Rets=this.Frmt=this.Args=this.action=val; }
			/**
			 * @type {boolean}
			 * @private
			 */
			get Debug 	()    { return this.debug; }
			set Debug 	(val) { this.debug =  val; }
			/**
			 * @type {DCT}
			 * @private
			 */
			get Clause 	()    { 
				let T = this;
				return (T.clause=="WHR" ? T.Args.CLAUSES :
					T.Args.TABLES.last.val.last.val.CLS);
			}
			set Clause 	(val) { 
				let T = this;
				if (T.clause=="WHR") T.Args.CLAUSES = val;
				else T.Args.TABLES.last.val.last.val.CLS = val;
			}

		/// QRY.MAKERS //////////////////////////////////////////////////////////////////////

			/** 
			 * @param {string} action Either `INSERT`, `SELECT`, `UPDATE`, or `DELETE` 
			 * @returns {string} A format template for the speified statement
			 * @memberof QRY
			 * @private
			 */
			newTemp		(action) { 
				return {
					INSERT: "%!{%!(k)r\t%!(v<<INTO>>)s|-/INSERT\tINTO\\n|;/\\n|+/\\n}s" +
							"%!{%!(v<<VALUES>>)s|-/VALUES\t\\x28\n\t|&/,\\n\t|+/\\n\\x29}s",
					//
					SELECT: "%!{%!(v)s|-/SELECT\t|;/,\\n \t}s" +
							"%{%!(k|^/U)s\t%(v<<TABLES>>)s|-/\\nFROM|;/\\n}s" +
							"%!{%!(k)s\t%!(v<<CLAUSES>>)s|-/\\n|;/\\n}s" +
							"%!{%!(k)s\t%!(v<<LIST>>)s|-/\\n|;/\\n}s" +
							"%!{%!(k)s\t%!(v<<DOT>>)s|-/\\n|;/\\n}s",
					//
					UPDATE: "%{%!(k|^/U)s\t%(v<<TABLES>>)s|-/UPDATE|;/\\n}s" +
							"%!{%!(k|^/U)s\t%(v<<SET>>)s|-/\\n}s" +
							"%!{%!(k)s\t%!(v<<CLAUSES>>)s|-/\\n|;/\\n}s",
					//
					DELETE: "%{%!(k|^/U)s\t%(v<<TABLES>>)s|-/DELETE\\nFROM|;/\\n}s" +
							"%!{%(k)s\t%(v<<CLAUSES>>)s|-/\\n|;/\\n}s",
					UNION:  "\nUNION\n",
					ALL: 	"\nUNION ALL\n"
				}[action]; 
			}
			/** 
			 * @param {string} action Either `INSERT`, `SELECT`, `UPDATE`, or `DELETE` 
			 * @returns {Object.<string,DCT>} A new container for the speified statement
			 * @private
			 */
			newState	(action) { 
				return {
					INSERT: {
						INTO: 	new DCT({}),
						VALUES: new DCT({}),
					},
					SELECT: {
						COLUMNS: new DCT({}),
						TABLES:  new DCT({ '':    {} }),
						CLAUSES: new DCT({ WHERE: {} }),
						ARRANGE: new DCT({}),
						OPTIONS: new DCT({}),
					},
					UPDATE: {
						TABLES:  new DCT({  '': {} }),
						COLUMNS: new DCT({}),
						CLAUSES: new DCT({}),
					},
					DELETE: {
						TABLES:  new DCT({ '':    {} }),
						CLAUSES: new DCT({ WHERE: { 1: { IS: 1 }}}),
					},
				}[action]; 
			}
			/** 
			 * @param {string} action Either `INSERT`, `SELECT`, `UPDATE`, or `DELETE` 
			 * @returns {Object.<string,Array<string>>} Restrictions for the speified statement
			 * @memberof QRY
			 * @private
			 */
			newRet		(action) { 
				return {
					INSERT: {
						ACT: SQL_RETS.SLC(["VALUES"]),
					},
					SELECT: {
						ACT: SQL_RETS.OTH(["FROM"],SQL_OMTS.UNI),
						CMP: SQL_RETS.CMP(),
						RGT: SQL_RETS.RGT(),
						JNS: SQL_RETS.JNS(SQL_RETS.OTH()),
						ONS: SQL_RETS.CND(SQL_RETS.JNS(SQL_RETS.OTH(),["ON"])),
						WHR: SQL_RETS.CND(SQL_RETS.OTH()),
						BTW: ["AND"],
						GRP: SQL_RETS.OTH([],["GRP"]),
						ORD: SQL_RETS.OTH([],["GRP","ORD"]),
						LMT: SQL_RETS.OTH(SQL_OMTS.OFS,SQL_OMTS.UNI),
						OFS: SQL_RETS.OTH([],SQL_OMTS.UNI),
						UNI: SQL_RETS.SLC(),
					},
					UPDATE: {
						ACT: SQL_RETS.JNS(["SET"],SQL_OMTS.WHR),
						COL: SQL_RETS.JNS([],SQL_OMTS.WHR),
						CMP: SQL_RETS.CMP(),
						RGT: SQL_RETS.RGT(),
						JNS: SQL_RETS.JNS(),
						WHR: SQL_RETS.CND(),
					},
					DELETE: {
						ACT: ["FROM"],
						CMP: SQL_RETS.CMP(),
						RGT: SQL_RETS.RGT(),
						JNS: SQL_RETS.JNS(),
						WHR: SQL_RETS.CND(),
					},
				}[action];
			}
			/** 
			 * Options for `FROM|JOIN` statements
			 * @typedef {object} QModifier
			 * @prop 	{string} [DB=''] The database of this table; if needed
			 * @prop 	{string} [AS=''] The `AS` identifier; if needed
			 * @prop 	{string} [CLS=''] The `JOIN` condition; if needed
			 */
			/**
			 * Creates a new `TABLE` entry for a `FROM|JOIN` query
			 * @param {string} keyword Either `FROM` or any of the `JOINs`
			 * @param {string} table The name of the `FROM|JOIN` table, or a `QRY` object
			 * @param {QModifier} [modifiers={DB:'',AS:'',CLS:''}] Options for `FROM|JOIN` statements
			 * @private
			 * @memberof QRY
			 */
			newTable 	(keyword, table, modifiers = {DB:'',AS:'',CLS:''}) {
				if (!!!keyword) this.Args.TABLES = new DCT({ 
					[keyword]: new DCT({}).push(
						this.cleanTable(table), modifiers
					) }	); 
				else this.Args.TABLES.push(keyword, new DCT({}).push(
						this.cleanTable(table), modifiers
					)	); 
				this.allowed = this.Rets.JNS; return this;
			}
			/**
			 * A general clause builder
			 * @param {string} clause Either `WHERE`, `AND`, or `OR`
			 * @param {string|number} [what] The left side of the clause
			 * @param {string|number} [is] The operator to judge the clause by
			 * @param {string|number} [to] The right side of the clause
			 * @param {string} [type='CLAUSES'] Either `CLAUSES` or `TABLES`
			 * @returns {this} The `QRY` instance chain
			 * @private
			 * @memberof QRY
			 */
			newClause 	(clause, what, is, to, type = 'CLAUSES') {
				let T = this, C = new DCT({}), P; T.conditions = [];
				if (!!what && !!is && !!to) {
					P = C.push(what,{[is]:to});
					T.allowed = T.Rets.WHR; T.conditions = [];
				} else if (!!what && !!is) {
					P = C.push(what,{[is]:{}});
					T.conditions = [what,is]; T.allowed = T.Rets.RGT; 
				} else if (!!what) {
					P = C.push(what,{});
					T.allowed = T.isKey(what)?T.Rets.WHR:T.Rets.CMP; 
					T.conditions = [what]; 
				};
				switch (clause) {
					case 'WHERE': T.noteClause('WHR');
								  T.Clause = new DCT({}).push(clause,P); 
						 		  break;;
					case    'ON': T.noteClause('ONS'); 
								  T.Clause = new DCT({[clause]:P}); 
								  T.allowed = T.Rets.ONS; break;;
					default: 	  T.Clause.push(clause,P);
				}; 	return T;
			}
			/**
			 * Adds an `OPERATOR` to the `QRY's` clause-chain
			 * @param {string} operator (EQ|NE|GT|LT|GE|LE|IN|EX|RGX)
			 * @param {boolean} [dynamic=false] `true`, if an `SQL` function; `false`, if a `VALUE`
			 * @returns {this} The `QRY` instance chain
			 * @private
			 * @memberof QRY
			 */
			newOperator	(operator, dynamic = false) {
				let T = this, N, C = T.conditions, 
					M = ['IN','LIKE','RLIKE','REGEXP','BETWEEN'], 
					K = [], O = {
						EQ:  '=', GT:  '>', GE: '>=', IS: 'IS', 
						NE: '<>', LT:  '<', LE: '<=', NT:'NOT', 
						IN: M[0], LK: M[1], RL: M[2],
						RX: M[3], BT: M[4], 
					}[operator], 
					L = T.Clause.last,
					V = L.val[C[0]].val;
				if ((C.has('IS')&&O=='NOT')||(C.has('NOT')&&M.has(O))) {
					K = Object.keys(V)[0]; O = `${K} ${O}`;
				}; L.val[C[0]].val = { [O]: null }; C[1] = O; 
				T.allowed = T.Rets.RGT; return new QFN(this, dynamic);
			}
			/**
			 * Adds a comparison `VALUE` to the `QRY's` clause-chain
			 * @param {...(string|number)} values The comparison values
			 * @returns {this} The `QRY` instance chain
			 * @private
			 * @memberof QRY
			 */
			newCompare	(...values) {
				let T = this, N, C = T.conditions, L = T.Clause.last;
				L.val[C[0]][C[1]] = (()=>'%![%!r|;/ AND ]s'.format(values));
				T.allowed = T.Rets[T.clause]; return T;
			}
			/**
			 * Adds a Dynamic `SQL` function to the `QRY's` clause-chain
			 * @param {string} name The name of the Dynamic `SQL` function
			 * @param {...(string|number)} args Any amount of argurments for the function
			 * @returns {this} The `QRY` instance chain
			 * @private
			 * @memberof QRY
			 */
			newDynamic	(name, ...args) {
				let T = this, N, C = T.conditions, L = T.Clause.last;
				L.val[C[0]][C[1]] = (()=>'%!s(%![%r|;/,]s)'.format(name, args));
				T.allowed = T.Rets[T.clause]; return T;
			}

		/// QRY.SETUP ///////////////////////////////////////////////////////////////////////

			/**
			 * Begin a `SELECT` statement
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			SLC  	(...columns) {
				let cols, kvps, typ = ISS(columns); 
				this.Action = 'SELECT'; 
				switch (typ) {
					case 'array': switch (true) {
						case ISS(columns[0])=='object': 
							kvps = columns[0];
							cols = Object.keys(kvps).map(
								k=>`${kvps[k]}\tAS\t${k}`
							);	break;;
						default: cols = columns; 
					}; 	break;; default: cols = ['*'];
				}
				this.Args.COLUMNS = cols;
				this.allowed = this.Rets.ACT;
				return this;
			}
			/**
			 * Begin a `INSERT` statement
			 * @param {string} table The table recieving `INSERTS`
			 * @param {...string} [columns] The columns recieving `VALUES`
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			INS  	(table, ...columns) {
				this.Action = 'INSERT';
				this.Args.INTO.push(table, columns);
				this.allowed = this.Rets.ACT;
				return this;
			}
			/**
			 * Begin a `UPDATE` statement
			 * @param {string} table The table recieving `UPDATES`
			 * @param {...string} options An optional `identifer` and `database` for the table
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			UPD  	(table, ...options) {
				this.Action = 'UPDATE';
				this.allowed = ["FROM"];
				let ret = this.FROM(table, ...options);
				this.allowed = this.Rets.ACT;
				return ret;
			}
			/**
			 * Begin a `DELETE` statement
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			DEL  	() {
				this.Action = 'DELETE';
				this.allowed = this.Rets.ACT;
				return this;
			}

		/// QRY.COLUMNS /////////////////////////////////////////////////////////////////////

			/**
			 * Designate `VALUES` of which to `INSERT`
			 * @param {...Array<string>} values The `VALUES` lists for each `INSERT`
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			VALUES  (...values) {
				let vals = {};
				values.map((v,k) => {vals[`L${k}`]=v;});
				this.Args.VALUES = new DCT(vals);
				this.allowed = []; return this;
			}
			/**
			 * Designate columns and values of which to `UPDATE`
			 * @param {Object.<string,*>} sets An object of `columns` and the `values` they'll be `SET` to
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			SET  	(sets) {
				this.Args.COLUMNS.SET = sets;
				this.allowed = this.Rets.COL;
				return this;
			}

		/// QRY.TABLES //////////////////////////////////////////////////////////////////////

			/**
			 * Designate first table the query pertains to
			 * @param {string|QRY} table The name of the `FROM` table, or a `QRY` object
			 * @param {string} [identifier] The `AS` identifier; if needed
			 * @param {string} [database] The database of this table; if needed
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			FROM  	(table, identifier, database) {
				return this.newTable('', table, { DB: database, AS: identifier });
			}
			/**
			 * Designate any a table to `JOIN` in the query
			 * @param {string} kind The type of `JOIN` (INNER|LEFT|RIGHT|FULL)
			 * @param {string|QRY} table The name of the `JOIN` table, or a `QRY` object
			 * @param {string} [identifier] The `AS` identifier; if needed
			 * @param {{ON:string,'=|IN|EXISTS|REGEXP|LIKE':string}} [on] The `JOIN` condition; if needed
			 * @param {string} [database] The database of this table; if needed
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			JOIN  	(kind, table, identifier, on, database) {
				kind = (kind || 'INNER').toUpperCase();
				if (['INNER','LEFT','RIGHT','FULL'].indexOf(kind) > -1) {
					return this.newTable(`${kind} JOIN`, table, { 
						DB: database, AS: identifier, CLS: {}
					}); 
				}; 	return this;
			}
			/**
			 * Designate a table `UNION` in the query
			 * @param {boolean} [ALL=false] If true; this will be `UNION ALL` (removes duplicate)
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			UNI  	(ALL = false) {
				this.Frmt = ['UNION','ALL'][Number(ALL)];
				this.allowed = this.Rets.UNI; return this;
			}

		/// QRY.CLAUSES /////////////////////////////////////////////////////////////////////

			/**
			 * The `WHERE` clause
			 * @param {string|number} [what] The left side of the clause
			 * @param {string|number} [is] The operator to judge the clause by
			 * @param {string|number} [to] The right side of the clause
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			WHR  	(what, is, to) {
				return this.newClause('WHERE', what, is, to);
			}
			/**
			 * An `AND` clause
			 * @param {string|number} [what] The left side of the clause
			 * @param {string|number} [is] The operator to judge the clause by
			 * @param {string|number} [to] The right side of the clause
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			AND  	(what, is, to) {
				return this.newClause(  'AND', what, is, to);
			}
			/**
			 * An `OR` clause
			 * @param {string|number} [what] The left side of the clause
			 * @param {string|number} [is] The operator to judge the clause by
			 * @param {string|number} [to] The right side of the clause
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			OR  	(what, is, to) {
				return this.newClause(   'OR', what, is, to);
			}
			/**
			 * An `ON` clause
			 * @param {string|number} [what] The left side of the clause
			 * @param {string|number} [is] The operator to judge the clause by
			 * @param {string|number} [to] The right side of the clause
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			ON  	(what, is, to) {
				return this.newClause(   'ON', what, is, to);
			}

		/// QRY.OPERATORS ///////////////////////////////////////////////////////////////////

			/**
			 * An `IN(...items)` operator
			 * @returns {this|function(...any)} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get IN	() { return this.newOperator('IN',true); }
			/**
			 * An `EXISTS(QRY)` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get EX	() { return this.newOperator('EXISTS',true); }

			/**
			 * A `=` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get EQ	() { return this.newOperator('EQ'); }
			/**
			 * A `<>` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get NE	() { return this.newOperator('NE'); }
			/**
			 * A `>` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get GT	() { return this.newOperator('GT'); }
			/**
			 * A `<` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get LT	() { return this.newOperator('LT'); }
			/**
			 * A `>=` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get GE	() { return this.newOperator('GE'); }
			/**
			 * A `<=` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get LE	() { return this.newOperator('LE'); }
			/**
			 * A `LIKE` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get LK	() { return this.newOperator('LK'); }
			/**
			 * A `REGEXP` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get RX	() { return this.newOperator('RX'); }
			/**
			 * A `RLIKE` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get RL	() { return this.newOperator('RL'); }
			/**
			 * A `BETWEEN` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get BT	() { return this.newOperator('BT'); }

			/**
			 * A `IS` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get IS	() { return this.newOperator('IS'); }
			/**
			 * A `NOT` operator
			 * @returns {this} The `QRY` instance chain
			 * @readonly
			 * @memberof QRY
			 */
			get NOT	() { return this.newOperator('NT'); }

		/// QRY.AGGREGATES //////////////////////////////////////////////////////////////////

			/**
			 * A `GROUP BY` statement
			 * @param {...string} columns The columns to `GROUP BY`
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			GRP  	(...columns) {
				this.Args.ARRANGE['GROUP BY'] = columns;
				this.allowed = this.Rets.GRP; return this;
			}
			/**
			 * An `ORDER BY` statement
			 * @param {...string} columns The columns to `ORDER BY`
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			ORD  	(...columns) {
				this.Args.ARRANGE['ORDER BY'] = columns;
				this.allowed = this.Rets.ORD; return this;
			}

		/// QRY.OPTIONS /////////////////////////////////////////////////////////////////////

			/**
			 * A `LIMIT` for the query
			 * @param {number} limit The amount to `LIMIT` the query by
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			LMT  	(limit) {
				this.Args.OPTIONS.LIMIT  = this.isKey(limit) ? limit : Number(limit);
				this.allowed = this.Rets.LMT;
				return this;
			}
			/**
			 * An `OFFSET` for a `LIMIT`
			 * @param {number} offset The `OFFSET` to start the `LIMIT` at
			 * @returns {this} The `QRY` instance chain
			 * @memberof QRY
			 */
			OFS  	(offset) {
				this.Args.OPTIONS.OFFSET = this.isKey(offset) ? offset : Number(offset);
				this.allowed = this.Rets.OFS;
				return this;
			}

		/// QRY.DETERMINERS /////////////////////////////////////////////////////////////////

			/**
			 * Check if a value is a query `KEY`
			 * @param {!string} key A colon-wrapped string value [:KEY:] 
			 * @returns {boolean} `true`, if it's a key; `false`, if not
			 * @memberof QRY
			 * @private
			 */
			isKey  	  	(key) { 
				let match = !!key && key.toString().match(/^(\/|):([^:]+):\1$/);
				return !!match && !!match.length; 
			}
			/**
			 * Check if a propery is a `KEYWORD`
			 * @param {!string} keyword The query `KEYWORD`
			 * @returns {boolean} `true`, if it's a `KEYWORD`; `false`, if not
			 * @memberof QRY
			 * @private
			 */
			isKEYWORD 	(keyword) {
				return !!keyword.match(/^[A-Z]+$/);
			}
			/**
			 * Check if a propery is a kwown `KEYWORD` function
			 * @param {!string} keyword The query `KEYWORD`
			 * @returns {boolean} `true`, if it's a `KEYWORD` function; `false`, if not
			 * @memberof QRY
			 * @private
			 */
			isKEYFUNC 	(keyword) {
				try { let 	prop = this[keyword],
							iset = !!prop,
							iget = iset && this.isGET(keyword),
							ityp = iset && TYPE(prop,Function); 
				return !!prop&&!this.isGET(keyword)&&TYPE(prop,Function);
				} catch (e) { console.log(e); return false; }
			}
			/**
			 * Checks if a property is a `get` property
			 * @param {string} name The property name
			 * @returns {boolean} `true`, if it has a `get` property
			 * @memberof QRY
			 * @private
			 */
			isGET		(name) {
				let ref = Reflect.getOwnPropertyDescriptor(this.__proto__,name);
				return !!ref&&!!ref.get;
			}
			/**
			 * Check if a query `ACTION` is allowed given the current context
			 * @param {!string} action The query `ACTION`
			 * @returns {boolean} `true`, if NOT allowed; `false`, if it IS
			 * @memberof QRY
			 * @private
			 */
			notAllowed 	(action) {
				if (this.allowed.indexOf(action) < 0) 
					throw new QueryError(action, this);
			}
			/**
			 * Turns a `DCT` object into a formatted string; if needed
			 * @param {string|DCT} table The name of the `FROM`/`JOIN` table, or a `QRY` object
			 * @returns {string} The table string or the formatted `DCT` string
			 * @memberof QRY
			 * @private
			 */
			cleanTable	(table) {
				if (TYPE(table, DCT)) {
					table = table.toString().replace(/^(.+)$/g,'\t$1');
					table = `(\n${table.replace(/^;$/,'')}\n)`;
				};	return table;
			}
			/**
			 * Set the current `CLAUSE` type (`WH[ERE]`|`ON`)
			 * @param {string} [clause] The type of `CLAUSE`
			 * @memberof QRY
			 * @private
			 */
			noteClause  (clause) {
				switch (clause.toUpperCase()) {
					case 'WHR': this.clause = 'WHR'; break;;
					case 'ONS': this.clause = 'ONS'; break;;
					case 'BTW': this.clause = 'BTW'; break;;
				}
			}

		/// QRY.TOs /////////////////////////////////////////////////////////////////////////

			/**
			 * @returns {Array<DCT>} The raw arguments used for formatting
			 * @memberof QRY
			 */
			toArgs  	() {
				var actn = this.Action, args = this.temp.VAL, rslt = Imm.List([]),
					mapr = v => {rslt = rslt.concat(Imm.fromJS(v).toList());};
				args.map(mapr); rslt = rslt.push(this.Format); return rslt.toArray();
			}
			/**
			 * @returns {string} A formatted query-string
			 * @memberof QRY
			 */
			toString  	() {
				var frmt = this.Frmt, args = this.toArgs(), R = /(\\[ux]\d+)/g;
				return  frmt.format.apply(frmt, args)
							.toColumns(this.Tabs)
							.replace(/^( +)(?= )/,'')
							.replace(/( +)$/,';')
							.replace(R,($0,$1)=>eval(`'${$1}'`));
			}
			/**
			 * @returns {string} A collapsed query-string
			 * @memberof QRY
			 */
			toSQL  		() {
				var KW = 	"(?:\\b(?:(?:SELECT|INSERT)(?:\\s+INTO)?|UPDATE|SET|VALUES|" +
							"FROM|(?:INNER|OUTER|FULL|LEFT|RIGHT)\\s+JOIN|AS|WHERE|" +
							"ON|AND|OR|NULL|LIKE|RLIKE|IN|IS|NOT|BETWEEN|" +
							"(?:GROUP|ORDER) BY|LIMIT|OFFSET)\\b)",
					WS = 	"[\\s\\n\\t]*",
					RG = 	new RegExp(''+KW+'('+WS+':.+:'+WS+')(?='+KW+'|$)', 'gmi');
				return 	this.toString()
							.replace(/([\n\s]+)/g, ' ')
							.replace(RG, '');
			}
			/**
			 * @returns {string} A formatted query-string with color
			 * @memberof QRY
			 */
			toPretty  	() { 
				return 	this.toString().colored(this.Colors);
			}

		/// QRY.STATICS /////////////////////////////////////////////////////////////////////

			/**
			 * Yields an `Array` of formatted exmaples
			 * @returns {Array<string>} An `Array` of formatted exmaples
			 * @static
			 * @memberof QRY
			 */
			static test() {
				return [
					new QRY(true)
						.SLC({ uid:'u.user_id', sid:'u.status_id', pass:'u.password' })
						.FROM(/users/, 'u')
						.JOIN('INNER', /user_join/, 	 'h').ON(/u.user_id/).EQ(/h.user_fk/)
						.JOIN('INNER', /user_languages/, 'l').ON(/u.user_id/).EQ(/h.user_fk/)
						.WHR(/status_id/).IN(1,2,3)
						.OR(/status_id/).EQ('6534')
						.AND(/last_name/).NOT.RL('FALSE%')
						.AND(/user_id/).BT(10,100)
						.GRP('u.user_id')
						.ORD('u.last_name','u.first_name','u.user_id')
						.LMT(':MAX:')
						.OFS(':PAGE:')
						.toPretty(),
					new QRY()
						.INS(/users/, 
							'first_name','status_id','password'
						).VALUES(
							['Nico', 1, 'wWC4534V4cfwFee#4vtg'],
							['Jane', 1, 'e4fw33cf4fEfReqVev4bt'],
						).toPretty(),
					new QRY()
						.INS(/users3/,'user_id','status_id','password')
						.SLC('user_id', 'status_id', 'password')
						.FROM(/users1/).WHR(/status_id/).IN(1,3)
						.UNI(true)
						.SLC('user_id', 'status_id', 'password')
						.FROM(/users2/).WHR(/status_id/).IN(1,3)
						.toPretty(),
					new QRY()
						.UPD(/users/).SET({
							'first_name': 'Janice', 
							'status_id': 2, 
							'password': 'dfs4-35264^#$#fdggdf'
						}).toPretty(),
					new QRY()
						.DEL().FROM(/users/)
						.WHR(/user_name/).EQ.CONCAT('user_',1)
						.OR(/user_name/).IN('user_',1)
						.AND(/user_name/,'=','user_1')
						.toSQL()
				];
			}

	}

/////////////////////////////////////////////////////////////////////////////////////////////
// CLASS.QFN

	/**
	 * Allows for `OPERATORS` to act simultaneously as `Getters` & `Functions`
	 * @extends {Function}
	 * @private
	 */
	class QFN extends Function {
		/**
		 * Creates an instance of QFN.
		 * @param {QRY} [queryObject] A `QRY` object to emulate
		 * @param {boolean} [dynamic=false] `true`, if an `SQL` function; `false`, if a `VALUE`
		 */
		constructor(queryObject, dynamic = false) {
			super(); 
			let prop = Object.getOwnPropertyNames(this),
				QRYO = queryObject;
			return new Proxy(this, { 
				/**
				 * 
				 * @param {QFN} target The `get` instance
				 * @param {string|number|symbol} name The property to `get`
				 * @param {Proxy} receiver Either the proxy or an object that inherits from the proxy
				 * @returns {any} The property; if found
				 * @memberof QFN#
				 * @access protected
				 * @ignore
				 */
				get(target, name, receiver) {
					let check = n=>prop.has(n)||typeof(n)=='symbol';
					if (!check(name)) return QRYO[name];
					else return Reflect.get(target,name,receiver);
				},
				/**
				 * 
				 * @param {QFN} target The target object
				 * @param {QFN} thisArg The this argument for the call
				 * @param {array} items The list of arguments for the call
				 * @returns {QRY} The orginal `QRY` object
				 * @memberof QFN#
				 * @access protected
				 * @ignore
				 */
				apply(target, thisArg, items) {
					if (dynamic) return QRYO.newDynamic('',...items); 
					else return QRYO.newCompare(...items.slice(0,2)); 
				}
			});
		}
	}

	// console.log(new QRY().newRet('SELECT'))

/////////////////////////////////////////////////////////////////////////////////////////////
// ERROR.QueryError

	/**
	 * Throws an instance of QueryError.
	 * @extends {SyntaxError}
	 * @protected
	 */
	class QueryError extends TypeError {
		/**
		 * Creates an instance of QueryError.
		 * @param {string} keyword The `keyword` that caused the `Error`
		 * @param {DCT} target The `DCT` object throwing the `Error`
		 */
		constructor(keyword, target) {
			let message = [
				`SQL.%s is invalid in the Context of a ${target.Action} statement.`,
				`Acceptable: %![SQL.%s()|;/, |&/ or ]s\n`,
			].join("\n").format(keyword, target.allowed);
			super(message); this.name = 'QueryError';
			TypeError.captureStackTrace(this, QueryError);
		}
	}


	// console.log(new QFN(new QRY(), '','')('hello','girl'));

/////////////////////////////////////////////////////////////////////////////////////////////
// COLLECTION.SQL

	/**
	 * An object used to filter a delimited string based on a `RegExp` pattern.
	 * @typedef {object} 	TFilter
	 * @prop 	{string} 	[split=","] 	 The character(s) the string is delimited with
	 * @prop 	{RegExp} 	[match="/.*\/g"] The `RegExp` pattern to filter the strings
	 * @prop 	{boolean} 	[equals=true]	 If `false`, returns non-matching strings
	 * @prop 	{string} 	[join=","]		 The character(s) the string is rejoined with
	 */
	
	/**
	 * An array of `coalesce` objects that will trickle down to the matching index of the `converters`
	 * @typedef {object} 	TCoalesce
	 * @prop 	{string} 	[none]		The string to use if the value is `null`
	 * @prop 	{string} 	[add]		A string to append to the value
	 * @prop 	{string} 	[insert="%s"]	A `sprintf` template that the value will be placed into
	 */
	
	/**
	 * A `callback` to handle an custom transformations for each filter.
	 * @typedef {function(string):string} CBConvert
	 */

	/**
	 * A collection of SQL Utilities
	 * @class SQL
	 */
	class SQL {
		/// SQL.QRY /////////////////////////////////////////////////////////////////////////

			/**
			 * Instantiates a new `QRY` object, unless otherwise specified
			 * @param {boolean} [instatiate=true] if `false`, does NOT instatiate the `QRY` 
			 * @returns {QRY} An instatiated `QRY` object, unless otherwise specified
			 * @memberof SQL
			 */
			static QRY  	(instatiate = true) { 
				return instatiate ? new QRY() : QRY; 
			}

			/**
			 * Begin a `SELECT` statement
			 * @param {...string|Object.<string,string>} [columns] The columns to `SELECT`
			 * @returns {QRY} The `QRY` instance chain
			 * @memberof SQL
			 */
			static SLC  	(...columns) { return SQL.QRY().SLC(...columns); }
			/**
			 * Begin a `INSERT` statement
			 * @param {string} table The table recieving `INSERTS`
			 * @param {...string} columns The columns recieving `VALUES`
			 * @returns {QRY} The `QRY` instance chain
			 * @memberof SQL
			 */
			static INS  	(table, ...columns) { return SQL.QRY().INS(table, ...columns); }
			/**
			 * Begin a `UPDATE` statement
			 * @param {string} table The table recieving `UPDATES`
			 * @param {...string} options An optional `identifer` and `database` for the table
			 * @returns {QRY} The `QRY` instance chain
			 * @memberof SQL
			 */
			static UPD  	(table, ...options) { return SQL.QRY().UPD(table, ...options); }
			/**
			 * Begin a `DELETE` statement
			 * @returns {QRY} The `QRY` instance chain
			 * @memberof SQL
			 */
			static DEL  	() { return SQL.QRY().DEL(); }
	
		/// SQL.FUNCTIONS ///////////////////////////////////////////////////////////////////

			/**
			 * Creates a `regex` pattern to match a query-template placeholder
			 * @param {string} key The placeholder's name
			 * @returns {RegExp} The `regex` pattern
			 */
			static PLACEHOLD(key) {  
				return (!!key ? 
					new RegExp("([\\t ]*)\:("+key.toUpperCase()+")\:", "g") : 
					/([\t ]*)\:([A-Z]+|(?:[/][A-z]+)+)\:/g
				); 
			}
			/**
			 * Takes a query-template and replaces the `placeholders` with the values specified
			 * @param {string} query An `SQL` query-template. This utilizes `:NAME:` placeholders
			 * @param {Object.<string,(string|number)>} values The values to place into the query
			 * @returns {string} The formatted `SQL` query
			 */
			static FORMAT  	(query, values, refs = {}) {
				if (!values) return query;
				var div = '********************************************************************************',
					kys = '<'+Object.keys(values).join("><")+'>',
					smi = '@#', has = key => {
						var mch = kys.match(new RegExp("(?:<)("+key+")(?:>)", "i"));
						return !!mch ? mch[1] : '';
					}, 	res = query, old = res, trys = 0, sl = '/',
					ref = (refs||{}), rgx = SQL.PLACEHOLD(),
					fgx = new RegExp(`(\\s*${smi})+`,'g'),
					ngx = /(?:(?:\n[\t ]*)(?=\n))+/g,
					ugx = /;(\s*(?:UNION|[)]))/g;
				while (!!res.match(rgx) && trys<3) {
					res = res.replace(rgx, (txt, nbsp, key, val) => {
						if (key.has(sl)) {
							key = key.split(sl).slice(1);
							key = key.length==2?key:key.concat([sl]);
							key = key.filter(k=>k!='/');
							val = ref[key[0]].Requests.get(key.last);
							val = val.Query.replace(/;+$/,'').trim();
							val = val.replace(/\n([^\n]+)/g,`\n${nbsp}$1`);
							val = `${val}${smi}`;
						} else {
							key = has(key); val = values[key]||''; 
						};  txt;
						return `${nbsp}${val}`;
					}); (res == old ? trys+1 : 0); old = res;
				}; 	res = res.replace(fgx,';').replace(ugx,'$1').replace(ngx,'');
				LG.IF("\n%s\n%s\n\n", div, res); return res;
			}
			/**
			 * Formats a clause for use in a `SQL` query
			 * @param {string} column The column-name this clause pertains to
			 * @param {string} operator The comparison operator (=|IN|EXISTS|REGEXP|...)
			 * @param {string} condition The value the column should conform to
			 * @param {string} prefix The type of clause (WHERE|AND|OR)
			 * @returns {string} The formatted `SQL` clause
			 */
			static CLAUSE  	(column, operator, condition, prefix) {
				column = TLS.Coalesce(column, '', ' '); operator = TLS.Coalesce(operator, '', ' ');
				condition = TLS.Coalesce(condition); prefix = TLS.Coalesce(prefix, null, ' ');
				return (!!operator && !!condition) ? TLS.Concat(prefix,column,operator,condition) : '';
			}
			/**
			 * A default type-parser for SQL result columns
			 * @param 	{mysql.Field}  field A `MySQL`.`Field` object
			 * @param 	{mysql.parser} next The next `Field`
			 * @returns {mysql.parser} The next field's `parser`
			 */
			static TYPE  	(field, next) {
				var nme = field.name, len = field.length, typ = field.type, val, obj;
				switch (typ) {
					case 'BLOB': case 'MEDIUM_BLOB': case 'LONG_BLOB': 
					case 'VAR_STRING': val = field.string() || '';
						try { return !!val.match(/^[\[{][\S\s]*[}\]]$/) ? JSON.parse(val) : val }
						catch (err) {
							console.log("ERROR: %s", err.message)
							return val;
						}
				}
				switch (nme) {
					case 'gpns': val = field.string() || -1;
						return ['0','1'].indexOf(val) > -1 ? val == '1' : val;
					case 'ip': val = field.string() || 0;
						return TLS.Lng2IP(parseInt(val));
					case 'mac': val = field.string() || '';
						return val.toUpperCase();
				}
				return next();
			}
			/**
			 * Restricts a pagination object to positive numbers and any specified thresholds
			 * @param {{page:number,limit:number}} vals A pagination object, specifying a page number & result limit
			 * @param {{page:number,limit:number}} threshold The page & number restrictions for the object
			 * @returns {{page:number,limit:number,offset:number}} The restricted pagination object
			 */
			static PAGE  	(vals, threshold) {
				var res = TLS.Fill(vals, { page: 1, limit: 10, offset: 0 }),
					kys = Object.keys(res), thrs = threshold || { page: 0, limit: -1 };
				kys.map(function (sp, s) {
					var ky = kys[s], num = (typeof(res[ky]) == 'number');
					res[ky] = num ? TLS.Positive(parseInt(res[ky]), parseInt(thrs[ky])) : res[ky];
				}); res.offset = (res.page - 1) * res.limit; return res;
			}
			/**
			 * A reducer, which filters, coalesces, converts (transforms), and joins delimited string to build a complex query-clause 
			 * @param {string}		vals 		Either a string or array of strings to include in the clause. Each subsequent filter/coalesce/converter will be applied to each string
			 * @param {TFilter}		[filter] 	A `TFilter` that will trickle down to the matching index of the `coalesce`/`converter`
			 * @param {TCoalesce}	[coalesce] 	A `TCoalesce` objects that will trickle down to the matching index of the `converter`
			 * @param {CBConvert}	[convert] 	A `CBConvert` to handle custom transformations matching the index of the corresponding `filter` object.
			 * @returns {string} The transformed query-clause
			 */
			static JOIN  	(val, filter, coalesce, convert) {
				var flt, cls, cnv, res;
				if (!!!val) { return ''; } else {
					flt = 	TLS.Fill(filter, { split: ',', match: /.*/g, equals: true, join: ',' });
					cls = 	TLS.Fill(coalesce, { none: '', add: '', insert: '' });
					cnv = 	convert || function (mch) { return mch; };
					res = 	val .split(flt.split)
								.filter(function (fl, f) { return !!fl.match(flt.match) == flt.equals; })
								.map(   function (mp, m) { return mp.replace(/(^.*$)/, cnv); })
								.join(flt.join);
					return 	TLS.Coalesce(res, cls.none, cls.add, cls.insert);
				}
			}
			/**
			 * A reducer, which filters, coalesces, converts (transforms), and joins a list of delimited string to build a complex Array of query-clauses
			 * @param {(string|Array<string>)}		 vals 		  Either a string or array of strings to include in the clause. Each subsequent filter/coalesce/converter will be applied to each string
			 * @param {(TFilter|Array<TFilter>)}	 [filters] 	  An array of `TFilters` that will trickle down to the matching index of the `coalesce`/`converters`
			 * @param {(TCoalesce|Array<TCoalesce>)} [coalesces]  An array of `TCoalesces` objects that will trickle down to the matching index of the `converters`
			 * @param {(CBConvert|Array<CBConvert>)} [converters] An array of `CBConverts` to handle custom transformations matching the index of the corresponding `filter` object.
			 * @returns {Array<string>} The transformed Array of query-clauses
			 */
			static LIST  	(vals, filters, coalesces, converters) {
				let res = [], A = a=>(ISS(a)=='array'), lst = (A(vals)?vals:[vals]),
					filt = filters||[], coal = coalesces||[], conv = converters||[];
				lst = lst.repeat(A(filt)&&filt.length?filt:lst.length);
				lst.map((ls, l) => { let val = SQL.JOIN( ls,
					(filt[l]||filt), (coal[l]||coal), (conv[l]||null)
				); 	!!val && res.push(val); }); return res;
			}
			/**
			 * Concatenates an Array of values, separated by a specified string, and finally, wrapped in specified brackets
			 * @param {Array<string>} 	val 		An array of values to wrap in brackets
			 * @param {Array<string>} 	brackets 	An array (length<=2) specifiying the opening and closing brackets
			 * @param {string} 			join 		The string to separate the concatenations
			 * @returns {string} The formatted expression
			 */
			static BRKT  	(val, brackets, join) {
				var brackets = !!brackets && brackets.length == 2 ? brackets : ['(',')'];
				return !!val.length ? brackets[0]+(!!join ? val.join(join) : val)+brackets[1] : '';
			}
			/**
			 * Not implemented yet.
			 * @returns {string}
			 */
			static COALESCE (quote, val, ...elses) { 
				let Q = (!!quote?'"':''), E = '';
				if (!!!elses||!!!elses.length) return '';
				E = `${Q}${elses.join(`${Q}, ${Q}`)}${Q}`;
				return `COALESCE(${Q}${val}${Q}, ${E})`; 
			}
			/**
			 * Creates an `CONCAT` expression for use in a `SQL` query
			 * @param {...(string|number)} args - The strings to concatenate
			 * @returns {string} The formatted expression
			 */
			static CONCAT  	(...args) { 
				return (args.length > 1 ? SQL.BRKT(args, ["CONCAT(",")"], ",") : "''"); 
			}
			/**
			 * Creates an `CONCAT_WS` expression for use in a `SQL` query
			 * @param {string} 				separator 	The string to separate the concatenations 
			 * @param {...(string|number)} 	args		The strings to concatenate
			 * @returns {string} The formatted expression
			 */
			static CONCAT_WS(separator, ...args) { 
				return (args.length > 1 ? SQL.BRKT([separator].concat(args), ["CONCAT_WS(",")"], ",") : "''"); 
			}
			/**
			 * Allows you to create `SocketLinks` in a `SQL` query
			 * @param {{link:string,columns:Array<string>,escapes:number}} [options={link:"",columns:null,escapes:1}] 
			 * @returns {string} A column `SELECT` statement that formats `SocketLink` string within a `SQL` query
			 */
			static SOCKET  	(options) {
				// -----------------------------------------------------------------------
				var cols, link, mtch, pnts, prms, qrys, sock, slsh, json, rslt,
					opts = Assign({}, optx, options||{}),
					cls  = 'SocketLink', CC = SQL.CONCAT, as = { as: 'item' };
				// -----------------------------------------------------------------------
				try {
					cols = 	opts.columns;
					link = 	opts.link;
					switch (ISS(link)) {
						case 'link': 	mtch = link.match(regx.mch);
							pnts = 	mtch[1] .replace(regx.pnt.mch, regx.pnt.rep)
											.replace(encl.mch, encl.arr);
							prms = 	mtch[2] .replace(regx.prm.mch, regx.prm.rep)
											.replace(encl.mch, encl.obj);
							qrys = 	mtch[3] .replace(regx.qry.mch, regx.qry.rep)
											.replace(regx.brk.mch, regx.brk.rep)
											.replace(regx.esc.mch, regx.esc.rep)
											.replace(encl.mch, encl.obj);
							// console.log('QRY:', qrys)
							sock = 	{
								point: 	JSON.parse(pnts||'""'),
								params: JSON.parse(prms||'{}'),
								query: 	Assign(as,JSON.parse(qrys||'{}')),
							};	break;;
						case 'object': 	sock = Assign({}, defx, link); break;;
						default: 		sock = Assign({}, defx);
					}
					slsh = 	"\\\\".dup(opts.escapes);
					json = 	JSON.stringify(sock);
					// console.log('SOCK:',JSON.stringify(sock,null,'  '))
				// -----------------------------------------------------------------------
				} catch (e) {
					console.log("\n[%s]: %s\n", e.stack, JSON.stringify({
						opts: opts, mtch: mtch, pnts: pnts, prms: prms,
						qrys: qrys, sock: sock, json: json, rslt: rslt
					}, null, '  ')); rslt = cls+dfsx;
				}
				// -----------------------------------------------------------------------
				if (!!cols) {
					json = 	json.replace(conx.esc.mch, conx.esc.rep(slsh))
								.replace(conx.col.mch, conx.col.rep(cols,-1));
					rslt = 	CC.apply({}, ("'"+(cls+json)+"'").split(conx.dlm));
				} else { rslt = (cls+json); }
				// -----------------------------------------------------------------------
				// console.log('SOCKET:', JSON.stringify(rslt,null,'  '))
				return rslt;
			}
			/**
			 * Creates an `LIMIT` clause for use in a `SQL` query
			 * @param {number} limit	The limit value
			 * @returns {string} The formatted clause
			 */
			static LIMIT  	(limit) { 
				return SQL.CLAUSE("",   "LIMIT", limit < 0 ? '' : limit); 
			}
			/**
			 * Creates an `OFFSET` clause for use in a `SQL` query
			 * @param {number} offset - The offset value
			 * @returns {string} The formatted clause
			 */
			static OFFSET 	(offset) { 
				return SQL.CLAUSE("",  "OFFSET", offset); 
			}

	};

/////////////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = SQL;
