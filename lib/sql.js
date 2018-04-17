
'use strict';

/////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const {
		Assign, Imm, NIL, UoN, IaN, IS, ISS, DCT,
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
		brk: { rep: '$1',   	  mch: /"(\[.*\]|\{.*\})"/g 								},
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
					green:   /([^']+\b(?='))/g,
					cyan: 	 { '/': /([^.])([^.\s]+(?=\.))/g, '$': 2 },
					grey: 	 { '/': /(AS )(\w+)/g, '$': 2 },
					magenta: /(\.|[<=>])/g,
					yellow:  { '/': /([^\w])((?:\d+)(?![\dm']|\x1b))/g, '$': 2 },
					blue: 	 /(:\w+:)/g,
					red: 	 (
						"/(\\b(?:(?:SELECT|INSERT)(?:\\s+INTO)?|UPDATE|SET|VALUES|" +
						"FROM|(?:INNER|OUTER|FULL|LEFT|RIGHT)\\s+JOIN|AS|WHERE|" +
						"ON|AND|OR|NULL|LIKE|RLIKE|IN|IS|NOT|BETWEEN|" +
						"^(?:GROUP|ORDER) BY|LIMIT|OFFSET)\\b)/gi"
					),
				};
		const 	SQL_TABS = {
					delimiter: 	'\t',
					suffix: 	false,
					align: 		{
						3: '+'
					},
					border: 	null, //' | ',
					callback  	(v) {
						var res =  v.align('\\.', '-').align("',?", '-');
						return res;
					},
					debug: 		false,
				};
		const 	SQL_FRMT = new FRMT({
					'KEYWORD': 	"%|^/U|s",
					'COLUMNS': 	"%[%!s|;/,\\n\t]s",
					'TABLES':  	"%!{%!(k)s%!(v<<ALIAS,EXT,JOINS>>)s}s",
					'ALIAS': 	"%!(AS|-/\t%s\t|+/\t \t)s",
					'EXT': 		"%!(DB|-/\tIN\t)s",
					'JOINS': 	"%!(CLS<<OPS>>)s",
					'INTO': 	"%[%!s|;/, \\n \t |-/(\\n|+/\\n)//]s",
					'VALUES':  	"%![%s|;/, \\n \t |-/VALUES (\\n|+/\\n)//]s",
					'SET': 		"%!{%!(k<<DOT>>)s\t%(=)s\t%!(v<<STRING>>)s|;/,\\n \t}s ",
					'COMPARE': 	"%!{%!(k|-/\t|+/\t)s%!(v|-/\t)s}s",
					'CLAUSES': 	"%!{%!(k<<DOT>>)s%!(v<<OPS>>)s}s",
					'OPS': 		"%!([WHERE,ON,AND,OR,=,<>,>,<,>=,<=,LIKE,RLIKE,IN,IS,IS NOT,BETWEEN]|-/\t%s\t)s",
					'ARRANGE':	"%!([GROUP BY,ORDER BY]|-/\t%s\t)s",
					'OPTIONS':	"%!([LIMIT,OFFSET]|-/\t%s\t)s",
					'STRING': 	"'%s'",
					'DOT': 		"%s",
				}, ['']);
		const 	SQL_ACTS = Imm.List(['INSERT', 'SELECT', 'UPDATE', 'DELETE']);

	class QRY extends EPROXY {
		/// QRY.PUBLISH /////////////////////////////////////////////////////////////////////
			constructor() {
				super({ get(target, name) {
					var mch = name.match(/^[A-Z]+$/);
					if (target.notAllowed(name)) {
						throw new SyntaxError((
							"SQL.%s is invalid in this Context.\n" +
							"Acceptable:\t[%!['SQL.%s()'|;/, |&/ or ]s]\n"
						).format(name, target.allowed));
					}; return target[name];
				} 	});
				this.action = ""; this.allowed = ["INS","SLC","UPD","DEL"];
				this.Temp = {
					INSERT: {
						TMP: 	"INSERT\tINTO\n" +
								"%!{%!(k)s%!(v<<INTO>>)s}s\n" +
								"%![%s|;/, \\n \t |-/VALUES (\\n|+/\\n)//]s",
						VAL: 	{
							TABLES:  new DCT({}),
							VALUES:  [ ],
						},
						RET: {
							ACT: ["INTO"],
						},
					},
					SELECT: {
						TMP: 	"%!{%!(v)s%!(k|-/\tAS\t)s|;/,\\n \t|-/SELECT\t}s\n" +
								"%{%!(k|^/U)s\t%(v<<TABLES>>)s|;/\\n|-/FROM}s\n" +
								"%!{%!(k)s\t%!(v<<CLAUSES>>)s|;/\\n}s\n" +
								"%!{%!(k)s\t%!(v<<LIST>>)s|;/\\n}s" +
								"%!{%!(k)s\t%!(v)s|;/\\n}s",
						VAL: 	{
							COLUMNS: new DCT({}),
							TABLES:  new DCT({ '':    {} }),
							CLAUSES: new DCT({ WHERE: {} }),
							ARRANGE: new DCT({
								"GROUP BY": null,
								"ORDER BY": null
							}),
							OPTIONS: new DCT({
								LIMIT:  null,
								OFFSET: null
							})
						},
						RET: {
							ACT: ["FROM"],
							JNS: ["JOIN","WHR","GRP","ORD","LMT","OFS"],
							WHR: ["AND","OR","GRP","ORD","LMT","OFS"],
							GRP: ["ORD","LMT","OFS"],
							ORD: ["GRP","LMT","OFS"],
							LMT: ["GRP","ORD","OFS"],
							OFS: ["GRP","ORD","LMT"],
						},
					},
					UPDATE: {
						TMP: 	"%{%!(k|^/U)s\t%(v<<TABLES>>)s|;/\\n|-/UPDATE}s\n" +
								"%!{%(k|^/U)s\t%(v<<SET>>)s}s\n" +
								"%!{%!(k)s\t%!(v<<CLAUSES>>)s|;/\\n}s",
						VAL: 	{
							TABLES:  new DCT({  '': 	{} }),
							COLUMNS: new DCT({ SET: 	{} }),
							CLAUSES: new DCT({ WHERE:  	{ 1: { IS: 1 }}}),
						},
						RET: {
							ACT: ["JOIN","SET"],
							COL: ["JOIN"],
							JNS: ["JOIN","WHR"],
							WHR: ["AND","OR"],
						},
					},
					DELETE: {
						TMP: 	"DELETE\n" +
								"%!{%(k)s\t%(v<<TABLES>>)s|\\n}s\n" +
								"%!{%(k)s\t%(v<<CLAUSES>>)s|\\n}s",
						VAL: 	{
							TABLES:  new DCT({ '': 		{} }),
							CLAUSES: new DCT({ WHERE: 	{ 1: { IS: 1 }}}),
						},
						RET: {
							ACT: ["FROM"],
							JNS: ["JOIN","WHR"],
							WHR: ["AND","OR"],
						},
					}
				}
				// if (!(this instanceof QRY)) return new QRY();
			}

		/// QRY.CONSTANTS ///////////////////////////////////////////////////////////////////

			get KeyWords  	() { return SQL_KWRD; }
			get Colors  	() { return SQL_CLRS; }
			get Tabs  		() { return SQL_TABS; }
			get Format  	() { return SQL_FRMT; }

		/// QRY.VARIABLES ///////////////////////////////////////////////////////////////////

			get Acts  	(   ) { return SQL_ACTS; }
			get Args  	(   ) { return this.Temp[this.Action].VAL; }
			get Rets  	(   ) { return this.Temp[this.Action].RET; }
			get Frmt  	(   ) { return this.Temp[this.Action].TMP; }
			get Action 	(   ) { return this.action; }
			set Action 	(val) { this.action =  val; }

		/// QRY.SETUP ///////////////////////////////////////////////////////////////////////

			SLC  	(cols) {
				this.Action = 'SELECT';
				this.Args.COLUMNS = cols;
				this.allowed = this.Rets.ACT;
				return this;
			}
			INS  	() {
				this.Action = 'INSERT';
				this.allowed = this.Rets.ACT;
				return this;
			}
			UPD  	(tb,opt) {
				this.Action = 'UPDATE';
				this.FROM(tb, opt || {});
				this.allowed = this.Rets.ACT;
				return this;
			}
			DEL  	() {
				this.Action = 'DELETE';
				this.allowed = this.Rets.ACT;
				return this;
			}

		/// QRY.COLUMNS /////////////////////////////////////////////////////////////////////

			INTO  	(tbl,opts) {
				var obj = Imm.Map(opts);
				this.Args.TABLES = { [tbl]: obj.keys() };
				this.Args.VALUES = obj.values();
				this.allowed = this.Rets.COL;
				return this;
			}
			SET  	(sets) {
				this.Args.COLUMNS.SET = sets;
				this.allowed = this.Rets.COL;
				return this;
			}

		/// QRY.TABLES //////////////////////////////////////////////////////////////////////

			FROM  	(tb,as,db) {
				this.Args.TABLES = new DCT({ '': { [tb]: { DB: db, AS: as } } });
				this.allowed = this.Rets.JNS;
				return this;
			}
			JOIN  	(knd,tb,as,on,db) {
				knd = (knd || 'INNER').toUpperCase();
				if (['INNER','LEFT','RIGHT','FULL'].indexOf(knd) > -1) {
					this.Args.TABLES.push(knd+' JOIN', {
						[tb]: { DB: db, AS: as, CLS: on }
					});
				}
				this.allowed = this.Rets.JNS;
				return this;
			}

		/// QRY.CLAUSES /////////////////////////////////////////////////////////////////////

			WHR  	(what,is,to) {
				this.Args.CLAUSES = new DCT({
					WHERE: { [what]: { [is]: (to || '"DFFRNT.SQL.ERROR"') } }
				});
				this.allowed = this.Rets.WHR;
				return this;
			}
			AND  	(what,is,to) {
				this.Args.CLAUSES.push('AND', {
					[what]: { [is]: (to || '"DFFRNT.SQL.ERROR"') }
				});
				this.allowed = this.Rets.WHR;
				return this;
			}
			OR  	(what,is,to) {
				this.Args.CLAUSES.push('AND', {
					[what]: { [is]: (to || '"DFFRNT.SQL.ERROR"') }
				});
				this.allowed = this.Rets.WHR;
				return this;
			}

		/// QRY.AGGREGATES //////////////////////////////////////////////////////////////////

			GRP  	(columns) {
				this.Args.ARRANGE['GROUP BY'] = Array(columns);
				this.allowed = this.Rets.GRP;
				return this;
			}
			ORD  	(columns) {
				this.Args.ARRANGE['ORDER BY'] = Array(columns);
				this.allowed = this.Rets.ORD;
				return this;
			}

		/// QRY.OPTIONS /////////////////////////////////////////////////////////////////////

			LMT  	(limit) {
				this.Args.OPTIONS.LIMIT  = this.isKey(limit) ? limit : Number(limit);
				this.allowed = this.Rets.LMT;
				return this;
			}
			OFS  	(offset) {
				this.Args.OPTIONS.OFFSET = this.isKey(offset) ? offset : Number(offset);
				this.allowed = this.Rets.OFS;
				return this;
			}

		/// QRY.FUNCTIONS ///////////////////////////////////////////////////////////////////

			isKey  	  	(key) { return !!key.match(/^:(.+):$/).length; }
			notAllowed  (act) {
				return (!!act.match(/^[A-Z]+$/) && this.allowed.indexOf(act) < 0);
			}
			/////////////////////////////////////////////////////////////////////////////////
			toArgs  	() {
				var temp = this.Args; temp.FRMT = this.Format;
				return Imm.fromJS(temp).toList().toArray()
			}
			toString  	() {
				var frmt = this.Frmt, args = this.toArgs();
				// console.log("%s", JSON.stringify(this.Args, null, '    '))
				return frmt.format.apply(frmt, args).toColumns(this.Tabs);
			}
			toSQL  		(params) {
				var KW = 	"(?:\\b(?:(?:SELECT|INSERT)(?:\\s+INTO)?|UPDATE|SET|VALUES|" +
							"FROM|(?:INNER|OUTER|FULL|LEFT|RIGHT)\\s+JOIN|AS|WHERE|" +
							"ON|AND|OR|NULL|LIKE|RLIKE|IN|IS|NOT|BETWEEN|" +
							"^(?:GROUP|ORDER) BY|LIMIT|OFFSET)\\b)",
					WS = 	"[\\s\\n\\t]*",
					RG = 	new RegExp(''+KW+'('+WS+':.+:'+WS+')(?='+KW+'|$)', 'gmi');
				return 	this.toString()
							.replace(/([\n\s]+)/g, ' ')
							.replace(RG, '')
							.replace(/^ *(.+?) *$/, '$1;');
			}
			toPretty  	() { return this.toString().colored(this.Colors); }
	}

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
	 * @prop 	{string} 	[none=""]		The string to use if the value is `null`
	 * @prop 	{string} 	[add=""]		A string to append to the value
	 * @prop 	{string} 	[insert="%s"]	A `sprintf` template that the value will be placed into	
	 */
	/**
	 * A `callback` to handle an custom transformations for each filter.
	 * @typedef {function(string):string} CBConvert
	 */
	const SQL = {
		/**
		 * Instantiates a new `QRY` object
		 * @return {QRY}
		 */
		QRY  		() { return new QRY(); },
		/**
		 * Creates a `regex` pattern to match a query-template placeholder
		 * @param {string} key The placeholder's name
		 * @returns {RegExp} The `regex` pattern
		 */
		PLACEHOLD  	(key) { return !!key ? new RegExp("(\:("+key.toUpperCase()+")\:)", "g") : /(\:([A-Z]+)\:)/g; },
		/**
		 * Takes a query-template and replaces the `placeholders` with the values specified
		 * @param {string} query An `SQL` query-template. This utilizes `:NAME:` placeholders
		 * @param {Object<string,(string|number)>} values The values to place into the query
		 * @returns {string} The formatted `SQL` query
		 */
		FORMAT  	(query, values) {
			if (!values) return query;
			var kys = '<'+Object.keys(values).join("><")+'>',
				has = function (key) {
					var mch = kys.match(new RegExp("(?:<)("+key+")(?:>)", "i"));
					return !!mch ? mch[1] : '';
				}, 	res = query, old = res, trys = 0;
			while (!!res.match(SQL.PLACEHOLD()) && trys<3) {
				res = res.replace(SQL.PLACEHOLD(), (txt, param, key) => {
					key = has(key); let val = values[key] || ''; return val;
				}); trys = (res == old ? trys+1 : 0); old = res;
			} 	LG.IF("\n\n%s\n\n", res); return res;
		},
		/**
		 * 
		 * @param {any} column 
		 * @param {any} operator 
		 * @param {any} condition 
		 * @param {any} prefix 
		 * @returns 
		 */
		CLAUSE  	(column, operator, condition, prefix) {
			column = TLS.Coalesce(column, '', ' '); operator = TLS.Coalesce(operator, '', ' ');
			condition = TLS.Coalesce(condition); prefix = TLS.Coalesce(prefix, null, ' ');
			return (!!operator && !!condition) ? TLS.Concat(prefix,column,operator,condition) : '';
		},
		/**
		 * A default type-converter for SQL result columns
		 * @param 	{Field}  field 	A `MySQL`.`Field` object
		 * @param 	{parser} next 	The next `Field`
		 * @returns {parser}
		 */
		TYPE  		(field, next) {
			var nme = field.name, len = field.length, typ = field.type, val, obj;
			switch (typ) {
				case 'BLOB': case 'VAR_STRING': val = field.string() || '';
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
		},
		/**
		 * Restricts a pagination object to positive numbers and any specified thresholds
		 * @param {{page:number,limit:number}} vals A pagination object, specifying a page number & result limit
		 * @param {{page:number,limit:number}} threshold The page & number restrictions for the object
		 * @returns {{page:number,limit:number,offset:number}} The restricted pagination object
		 */
		PAGE  		(vals, threshold) {
			var res = TLS.Fill(vals, { page: 1, limit: 10, offset: 0 }),
				kys = Object.keys(res), thrs = threshold || { page: 0, limit: -1 };
			kys.map(function (sp, s) {
				var ky = kys[s], num = (typeof(res[ky]) == 'number');
				res[ky] = num ? TLS.Positive(parseInt(res[ky]), parseInt(thrs[ky])) : res[ky];
			}); res.offset = (res.page - 1) * res.limit; return res;
		},
		/**
		 * A reducer, which filters, coalesces, converts (transforms), and joins delimited string to build a complex query-clause 
		 * @param {string}		vals 		Either a string or array of strings to include in the clause. Each subsequent filter/coalesce/converter will be applied to each string
		 * @param {TFilter}		[filter] 	A `TFilter` that will trickle down to the matching index of the `coalesce`/`converter`
		 * @param {TCoalesce}	[coalesce] 	A `TCoalesce` objects that will trickle down to the matching index of the `converter`
		 * @param {CBConvert}	[convert] 	A `CBConvert` to handle custom transformations matching the index of the corresponding `filter` object.
		 * @returns {string} The transformed query-clause
		 */
		JOIN  		(val, filter, coalesce, convert) {
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
		},
		/**
		 * A reducer, which filters, coalesces, converts (transforms), and joins a list of delimited string to build a complex Array of query-clauses
		 * @param {(string|Array<string>)}		 vals 		  Either a string or array of strings to include in the clause. Each subsequent filter/coalesce/converter will be applied to each string
		 * @param {(TFilter|Array<TFilter>)}	 [filters] 	  An array of `TFilters` that will trickle down to the matching index of the `coalesce`/`converters`
		 * @param {(TCoalesce|Array<TCoalesce>)} [coalesces]  An array of `TCoalesces` objects that will trickle down to the matching index of the `converters`
		 * @param {(CBConvert|Array<CBConvert>)} [converters] An array of `CBConverts` to handle custom transformations matching the index of the corresponding `filter` object.
		 * @returns {Array<string>} The transformed Array of query-clauses
		 */
		LIST  		(vals, filters, coalesces, converters) {
			let res = [], A = a=>(ISS(a)=='array'), lst = (A(vals)?vals:[vals]),
				filt = filters||[], coal = coalesces||[], conv = converters||[];
			lst = lst.repeat(A(filt)&&filt.length?filt:lst.length);
			lst.map((ls, l) => { let val = SQL.JOIN( ls,
				(filt[l]||filt), (coal[l]||coal), (conv[l]||null)
			); 	!!val && res.push(val); }); return res;
		},
		/**
		 * Concatenates an Array of values, separated by a specified string, and finally, wrapped in specified brackets
		 * @param {Array<string>} 	val 		An array of values to wrap in brackets
		 * @param {Array<string>} 	brackets 	An array (length<=2) specifiying the opening and closing brackets
		 * @param {string} 			join 		The string to separate the concatenations
		 */
		BRKT  		(val, brackets, join) {
			var brackets = !!brackets && brackets.length == 2 ? brackets : ['(',')'];
			return !!val.length ? brackets[0]+(!!join ? val.join(join) : val)+brackets[1] : '';
		},
		/**
		 * @ignore
		 */
		COALESCE  	() { return ''; },
		/**
		 * Creates an `CONCAT` clause for use in a `SQL` query
		 * @param {...(string|number)} args - The strings to concatenate
		 * @returns string
		 */
		CONCAT  	(...args) { return (args.length > 1 ? SQL.BRKT(args, ["CONCAT(",")"], ",") : "''"); },
		/**
		 * Creates an `CONCAT_WS` clause for use in a `SQL` query
		 * @param {string} 				separator 	The string to separate the concatenations 
		 * @param {...(string|number)} 	args		The strings to concatenate
		 * @returns string
		 */
		CONCAT_WS  	(separator, ...args) { return (args.length > 1 ? SQL.BRKT([separator].concat(args), ["CONCAT_WS(",")"], ",") : "''"); },
		/**
		 * Allows you to create `SocketLinks` in a `SQL` query
		 * @param {{link:string,columns:Array<string>,escapes:number}} [options={link:"",columns:null,escapes:1}] 
		 * @returns {string} A column `SELECT` statement that formats `SocketLink` string within a `SQL` query
		 */
		SOCKET  	(options) {
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
		},
		/**
		 * Creates an `LIMIT` clause for use in a `SQL` query
		 * @param {number} lmt	The limit value
		 * @returns string
		 */
		LIMIT  		(lmt) { return SQL.CLAUSE("",   "LIMIT", lmt < 0 ? '' : lmt); },
		/**
		 * Creates an `OFFSET` clause for use in a `SQL` query
		 * @param {number} ofs - The offset value
		 * @returns string
		 */
		OFFSET 		(ofs) { return SQL.CLAUSE("",  "OFFSET", ofs); }
	};

/////////////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = SQL;
