
'use strict';

/////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const {
		Assign, Imm, NIL, UoN, IaN, IS, ISS, DCT,
		RGX, FRMT, ELOGR, Dbg, LG, TLS, JSN
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
					ltGreen:  	/([^']+\b(?='))/g,
					gray: 		{ '/': /([^.])([^.\s]+(?=\.))/g, '$': 2 },
					grey: 		{ '/': /(AS )(\w+)/g, '$': 2 },
					magenta: 	/(\.|[<=>])/g,
					ltYellow: 	{ '/': /([^\w])((?:\d+)(?![\dm']|\x1b))/g, '$': 2 },
					ltBlue: 	/(:\w+:)/g,
					ltCyan: 	(
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

	class _QRY {
		/// QRY.PUBLISH /////////////////////////////////////////////////////////////////////
			constructor() {
				this.action = ""; this.allowed = ["INS","SLC","UPD","DEL"];
				this.Temp = {
					INSERT: {
						TMP: 	"INSERT\tINTO\n" +
								"%!{%!(k)s%!(v<<INTO>>)s}s\n" +
								"%![%s|;/, \\n \t |-/VALUES (\\n|+/\\n)//]s",
						VAL: 	{
							TABLES:  DCT({}),
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
							COLUMNS: DCT({}),
							TABLES:  DCT({ '':    {} }),
							CLAUSES: DCT({ WHERE: {} }),
							ARRANGE: DCT({
								"GROUP BY": null,
								"ORDER BY": null
							}),
							OPTIONS: DCT({
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
							TABLES:  DCT({  '': 	{} }),
							COLUMNS: DCT({ SET: 	{} }),
							CLAUSES: DCT({ WHERE:  	{ 1: { IS: 1 }}}),
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
							TABLES:  DCT({ '': 		{} }),
							CLAUSES: DCT({ WHERE: 	{ 1: { IS: 1 }}}),
						},
						RET: {
							ACT: ["FROM"],
							JNS: ["JOIN","WHR"],
							WHR: ["AND","OR"],
						},
					}
				}
				if (!(this instanceof QRY)) return new QRY();
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
				this.Args.TABLES = DCT({ '': { [tb]: { DB: db, AS: as } } });
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
				this.Args.CLAUSES = DCT({
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

	/// PROXY ///////////////////////////////////////////////////////////////////////////////

		const QRY = new Proxy(_QRY,	{
			get  (target, name) {
				console.log('NAME', name)
				var mch = name.match(/^[A-Z]+$/);
				if (target.notAllowed(name)) {
					throw new SyntaxError((
						"SQL.%s is invalid in this Context.\n" +
						"Acceptable:\t[%!['SQL.%s()'|;/, |&/ or ]s]\n"
					).format(name, target.allowed));
				}; return target[name];
			}
		});

/////////////////////////////////////////////////////////////////////////////////////////////
// COLLECTION.SQL

	const SQL = {
		QRY  		() { return new QRY(); },
		PLACEHOLD  	(key) { return !!key ? new RegExp("(\:("+key+")\:)", "g") : /(\:([A-Z]+)\:)/g; },
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
		CLAUSE  	(column, operator, condition, prefix) {
			column = TLS.Coalesce(column, '', ' '); operator = TLS.Coalesce(operator, '', ' ');
			condition = TLS.Coalesce(condition); prefix = TLS.Coalesce(prefix, null, ' ');
			return (!!operator && !!condition) ? TLS.Concat(prefix,column,operator,condition) : '';
		},
		TYPE  		(field, next) {
			var nme = field.name, len = field.length, typ = field.type, val, obj;
			// console.log("COLUMN: %s | TYPE: %s", nme, typ)
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
		PAGE  		(vals, threshold) {
			var res = TLS.Fill(vals, { page: 1, limit: 10, offset: 0 }),
				kys = Object.keys(res), thrs = threshold || { page: 0, limit: -1 };
			kys.map(function (sp, s) {
				var ky = kys[s], num = (typeof(res[ky]) == 'number');
				res[ky] = num ? TLS.Positive(parseInt(res[ky]), parseInt(thrs[ky])) : res[ky];
			}); res.offset = (res.page - 1) * res.limit; return res;
		},
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
		LIST  		(vals, filters, coalesces, converters) {
			var res = []; filters = filters || []; coalesces = coalesces || []; converters = converters || [];
			vals.map(function (ls, l) {
				var val = SQL.JOIN( ls,
					(filters[l] || filters), (coalesces[l] || coalesces), (converters[l] || null)
				);
				!!val && res.push(val);
			}); return res;
		},
		BRKT  		(val, brackets, join) {
			var brackets = !!brackets && brackets.length == 2 ? brackets : ['(',')'];
			return !!val.length ? brackets[0]+(!!join ? val.join(join) : val)+brackets[1] : '';
		},
		COALESCE  	() { return ''; },
		CONCAT  	() {
			var args = TLS.Args(arguments);
			return (args.length > 1 ? SQL.BRKT(args, ["CONCAT(",")"], ",") : "''")
		},
		CONCAT_WS  	() {
			var args = TLS.Args(arguments);
			return (args.length > 1 ? SQL.BRKT(args, ["CONCAT_WS(",")"], ",") : "''")
		},
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
		LIMIT  		(lmt) { return SQL.CLAUSE("",   "LIMIT", lmt < 0 ? '' : lmt); },
		OFFSET 		(ofs) { return SQL.CLAUSE("",  "OFFSET", ofs); }
	};

/////////////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = SQL;
