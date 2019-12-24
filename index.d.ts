
/** @hidden */
import * as mysql from 'mysql';

/**
 * A collection of SQL Utilities & MySQL connector
 */
export module 'dffrnt.model' {

    declare const Defaults: CFG.Database;

    /**
     * Creates a new `MySQL` Connection Pool.
     */
    export class Connection {
        /**
         * Creates a new `MySQL` Connection Pool.
         */
        constructor(settings: CFG.Database);

        /**
         * Describes the `global` database `settings`.`Queue` size.
         */
        readonly get queue(): number;
        /**
         * A bucket of queued connections.
         */
        readonly get bucket(): any[];
        /**
         * Describes the `global` database `settings`.`Config` object (used for all `pool` servers).
         */
        readonly get config(): CFG.MSQL.Options;
        /**
         * Describes the collection of DBPool `servers` in `settings`.`Pool`.
         */
        readonly get servers(): { [poolName: string]: CFG.MSQL.Pool };
        /**
         * A MySQL connection `pool`
         */
        readonly get pool(): MySQL.PoolCluster;
        /**
         * Whether or not the `Connection` is being kept alive
         */
        readonly get keptAlive(): boolean;

        /**
         * Initiates the Database `pool`.
         */
        init(): void;

        /**
         * Sends a `ping` to the `database`, expecting a response.
         */
        ping(): void;
        /**
         * Will continually `ping` the `db` at an interval specified in the `configs`.
         */
        keepAlive(): void;
        /**
         * Aquires a `database` connection from the `pool`.
         * @returns The database `Connection`
         */
        getConnection(): Promise<MySQL.PoolConnection>;
        /**
         * Fills the `Queue` with new `Connections`.
         */
        getQueue(): void;
        /**
         * Adds a new `Connection` to the `queue`.
         * @returns `true`, if successful.
         */
        setQueue(): boolean;
        /**
         * Aquires a `database` connection from the `queue`.
         * @returns An asynchronus object of `{ error, rows }`
         */
        acquire(): {
            query(options: mysql.QueryOptions): Promise<{
                error: mysql.MysqlError | null,
                results: any,
                fields: mysql.FieldInfo[]
            }>
        };
        /**
         * Closes the `database` connection.
         */
        finish(): void;

        /**
         * Sends out `database` logs.
         * @param message On `success`; message is displayed _as-is_. On `error` it's used as a `sprintf`_-style_ template for `err.message`.
         * @param err An `error` object; if applicable.
         */
        log(message: string, err?: Error): void;

    }

    /**
     * Creates `SQL` queries with integrity in mind
     */
    declare class QRY extends EPROXY {
        /**
         * Creates `SQL` queries with integrity in mind
         */
        constructor(debug?: boolean);

        /**
         * Begin a `SELECT` statement
         * @returns The `QRY` instance chain
         */
        SLC(): this;
        /**
         * Begin a `INSERT` statement
         * @param table The table recieving `INSERTS`
         * @param columns The columns recieving `VALUES`
         * @returns The `QRY` instance chain
         */
        INS(table: string, ...columns?: string): this;
        /**
         * Begin a `UPDATE` statement
         * @param table The table recieving `UPDATES`
         * @param options An optional `identifer` and `database` for the table
         * @returns The `QRY` instance chain
         */
        UPD(table: string, ...options: string): this;
        /**
         * Begin a `DELETE` statement
         * @returns The `QRY` instance chain
         */
        DEL(): this;

        /**
         * Designate `VALUES` of which to `INSERT`
         * @param values The `VALUES` lists for each `INSERT`
         * @returns The `QRY` instance chain
         */
        VALUES(...values: string[]): this;
        /**
         * Designate columns and values of which to `UPDATE`
         * @param sets An object of `columns` and the `values` they'll be `SET` to
         * @returns The `QRY` instance chain
         */
        SET(sets: { [key: string]: * }): this;

        /**
         * Designate first table the query pertains to
         * @param table The name of the `FROM` table, or a `QRY` object
         * @param identifier The `AS` identifier; if needed
         * @param database The database of this table; if needed
         * @returns The `QRY` instance chain
         */
        FROM(table: string | QRY, identifier?: string, database?: string): this;
        /**
         * Designate any a table to `JOIN` in the query
         * @param kind The type of `JOIN` (INNER|LEFT|RIGHT|FULL)
         * @param table The name of the `JOIN` table, or a `QRY` object
         * @param identifier The `AS` identifier; if needed
         * @param on The `JOIN` condition; if needed
         * @param database The database of this table; if needed
         * @returns The `QRY` instance chain
         */
        JOIN(kind: string, table: string | QRY, identifier?: string, on?: Object, database?: string): this;
        /**
         * Designate a table `UNION` in the query
         * @param ALL If true; this will be `UNION ALL` (removes duplicate)
         * @returns The `QRY` instance chain
         */
        UNI(ALL?: boolean): this;

        /**
         * The `WHERE` clause
         * @param what The left side of the clause
         * @param is The operator to judge the clause by
         * @param to The right side of the clause
         * @returns The `QRY` instance chain
         */
        WHR(what?: string | number, is?: string | number, to?: string | number): this;
        /**
         * An `AND` clause
         * @param what The left side of the clause
         * @param is The operator to judge the clause by
         * @param to The right side of the clause
         * @returns The `QRY` instance chain
         */
        AND(what?: string | number, is?: string | number, to?: string | number): this;
        /**
         * An `OR` clause
         * @param what The left side of the clause
         * @param is The operator to judge the clause by
         * @param to The right side of the clause
         * @returns The `QRY` instance chain
         */
        OR(what?: string | number, is?: string | number, to?: string | number): this;
        /**
         * An `ON` clause
         * @param what The left side of the clause
         * @param is The operator to judge the clause by
         * @param to The right side of the clause
         * @returns The `QRY` instance chain
         */
        ON(what?: string | number, is?: string | number, to?: string | number): this;

        /**
         * An `IN(...items)` operator
         * @returns The `QRY` instance chain
         */
        readonly get IN(): this;
        /**
         * An `EXISTS(QRY)` operator
         * @returns The `QRY` instance chain
         */
        readonly get EX(): this;
        /**
         * A `=` operator
         * @returns The `QRY` instance chain
         */
        readonly get EQ(): this;
        /**
         * A `<>` operator
         * @returns The `QRY` instance chain
         */
        readonly get NE(): this;
        /**
         * A `>` operator
         * @returns The `QRY` instance chain
         */
        readonly get GT(): this;
        /**
         * A `<` operator
         * @returns The `QRY` instance chain
         */
        readonly get LT(): this;
        /**
         * A `>=` operator
         * @returns The `QRY` instance chain
         */
        readonly get GE(): this;
        /**
         * A `<=` operator
         * @returns The `QRY` instance chain
         */
        readonly get LE(): this;
        /**
         * A `LIKE` operator
         * @returns The `QRY` instance chain
         */
        readonly get LK(): this;
        /**
         * A `REGEXP` operator
         * @returns The `QRY` instance chain
         */
        readonly get RX(): this;
        /**
         * A `RLIKE` operator
         * @returns The `QRY` instance chain
         */
        readonly get RL(): this;
        /**
         * A `BETWEEN` operator
         * @returns The `QRY` instance chain
         */
        readonly get BT(): this;
        /**
         * A `IS` operator
         * @returns The `QRY` instance chain
         */
        readonly get IS(): this;
        /**
         * A `NOT` operator
         * @returns The `QRY` instance chain
         */
        readonly get NOT(): this;

        /**
         * A `GROUP BY` statement
         * @param columns The columns to `GROUP BY`
         * @returns The `QRY` instance chain
         */
        GRP(...columns: string): this;

        /**
         * An `ORDER BY` statement
         * @param columns The columns to `ORDER BY`
         * @returns The `QRY` instance chain
         */
        ORD(...columns: string): this;

        /**
         * A `LIMIT` for the query
         * @param limit The amount to `LIMIT` the query by
         * @returns The `QRY` instance chain
         */
        LMT(limit: number): this;

        /**
         * An `OFFSET` for a `LIMIT`
         * @param offset The `OFFSET` to start the `LIMIT` at
         * @returns The `QRY` instance chain
         */
        OFS(offset: number): this;

        /**
         * 
         * @returns The raw arguments used for formatting
         */
        toArgs(): DCT[];
        /**
         * 
         * @returns A formatted query-string
         */
        toString(): string;
        /**
         * 
         * @returns A collapsed query-string
         */
        toSQL(): string;
        /**
         * 
         * @returns A formatted query-string with color
         */
        toPretty(): string;

        /**
         * Yields an `Array` of formatted exmaples
         * @returns An `Array` of formatted exmaples
         */
        static test(): string[];

    }

    /**
     * Options for `FROM|JOIN` statements
     */
    declare interface QModifier {
        /**
         * The database of this table; if needed
         */
        DB?: string;
        /**
         * The `AS` identifier; if needed
         */
        AS?: string;
        /**
         * The `JOIN` condition; if needed
         */
        CLS?: string;
    }

    /**
     * Throws an instance of QueryError.
     */
    declare class QueryError {
        /**
         * Throws an instance of QueryError.
         */
        constructor(keyword: string, target: DCT);

    }

    /**
     * An object used to filter a delimited string based on a `RegExp` pattern.
     */
    declare interface TFilter {
        /**
         * The character(s) the string is delimited with
         */
        split?: string;
        /**
         * The `RegExp` pattern to filter the strings
         */
        match?: RegExp;
        /**
         * If `false`, returns non-matching strings
         */
        equals?: boolean;
        /**
         * The character(s) the string is rejoined with
         */
        join?: string;
    }
    /**
     * An array of `coalesce` objects that will trickle down to the matching index of the `converters`
     */
    declare interface TCoalesce {
        /**
         * The string to use if the value is `null`
         */
        none?: string;
        /**
         * A string to append to the value
         */
        add?: string;
        /**
         * A `sprintf` template that the value will be placed into
         */
        insert?: string;
    }

    /**
     * A `callback` to handle an custom transformations for each filter.
     */
    declare type CBConvert = ()=>void;

    export class SQL {
        /**
         * A collection of SQL Utilities
         */
        constructor();

        /**
         * Instantiates a new `QRY` object, unless otherwise specified
         * @param instatiate if `false`, does NOT instatiate the `QRY`
         * @returns An instatiated `QRY` object, unless otherwise specified
         */
        static QRY(instatiate?: boolean): QRY;

        /**
         * Begin a `SELECT` statement
         * @param columns The columns to `SELECT`
         * @returns The `QRY` instance chain
         */
        static SLC(...columns?: string | { [key: string]: string }): QRY;
        /**
         * Begin a `INSERT` statement
         * @param table The table recieving `INSERTS`
         * @param columns The columns recieving `VALUES`
         * @returns The `QRY` instance chain
         */
        static INS(table: string, ...columns: string): QRY;
        /**
         * Begin a `UPDATE` statement
         * @param table The table recieving `UPDATES`
         * @param options An optional `identifer` and `database` for the table
         * @returns The `QRY` instance chain
         */
        static UPD(table: string, ...options: string): QRY;
        /**
         * Begin a `DELETE` statement
         * @returns The `QRY` instance chain
         */
        static DEL(): QRY;

        /**
         * Creates a `regex` pattern to match a query-template placeholder
         * @param key The placeholder's name
         * @returns The `regex` pattern
         */
        static PLACEHOLD(key: string): RegExp;
        /**
         * Takes a query-template and replaces the `placeholders` with the values specified
         * @param query An `SQL` query-template. This utilizes `:NAME:` placeholders
         * @param values The values to place into the query
         * @returns The formatted `SQL` query
         */
        static FORMAT(query: string, values: { [key: string]: (string|number) }): string;
        /**
         * Formats a clause for use in a `SQL` query
         * @param column The column-name this clause pertains to
         * @param operator The comparison operator (=|IN|EXISTS|REGEXP|...)
         * @param condition The value the column should conform to
         * @param prefix The type of clause (WHERE|AND|OR)
         * @returns The formatted `SQL` clause
         */
        static CLAUSE(column: string, operator: string, condition: string, prefix: string): string;
        /**
         * A default type-parser for SQL result columns
         * @param field A `MySQL`.`Field` object
         * @param next The next `Field`
         * @returns The next field's `parser`
         */
        static TYPE(field: mysql.Field, next: mysql.parser): mysql.parser;
        /**
         * Restricts a pagination object to positive numbers and any specified thresholds
         * @param vals A pagination object, specifying a page number & result limit
         * @param threshold The page & number restrictions for the object
         * @returns The restricted pagination object
         */
        static PAGE(vals: Object, threshold: Object): Object;
        /**
         * A reducer, which filters, coalesces, converts (transforms), and joins delimited string to build a complex query-clause
         * @param vals Either a string or array of strings to include in the clause. Each subsequent filter/coalesce/converter will be applied to each string
         * @param filter A `TFilter` that will trickle down to the matching index of the `coalesce`/`converter`
         * @param coalesce A `TCoalesce` objects that will trickle down to the matching index of the `converter`
         * @param convert A `CBConvert` to handle custom transformations matching the index of the corresponding `filter` object.
         * @returns The transformed query-clause
         */
        static JOIN(vals: string, filter?: TFilter, coalesce?: TCoalesce, convert?: CBConvert): string;
        /**
         * A reducer, which filters, coalesces, converts (transforms), and joins a list of delimited string to build a complex Array of query-clauses
         * @param vals Either a string or array of strings to include in the clause. Each subsequent filter/coalesce/converter will be applied to each string
         * @param filters An array of `TFilters` that will trickle down to the matching index of the `coalesce`/`converters`
         * @param coalesces An array of `TCoalesces` objects that will trickle down to the matching index of the `converters`
         * @param converters An array of `CBConverts` to handle custom transformations matching the index of the corresponding `filter` object.
         * @returns The transformed Array of query-clauses
         */
        static LIST(vals: string | string[], filters?: TFilter | TFilter[], coalesces?: TCoalesce | TCoalesce[], converters?: CBConvert | CBConvert[]): string[];
        /**
         * Concatenates an Array of values, separated by a specified string, and finally, wrapped in specified brackets
         * @param val An array of values to wrap in brackets
         * @param brackets An array (length<=2) specifiying the opening and closing brackets
         * @param join The string to separate the concatenations
         * @returns The formatted expression
         */
        static BRKT(val: string[], brackets: string[], join: string): string;
        /**
         * Not implemented yet.
         * @returns
         */
        static COALESCE(): string;
        /**
         * Creates an `CONCAT` expression for use in a `SQL` query
         * @param args - The strings to concatenate
         * @returns The formatted expression
         */
        static CONCAT(...args: string | number): string;
        /**
         * Creates an `CONCAT_WS` expression for use in a `SQL` query
         * @param separator The string to separate the concatenations
         * @param args The strings to concatenate
         * @returns The formatted expression
         */
        static CONCAT_WS(separator: string, ...args: string | number): string;
        /**
         * Allows you to create `SocketLinks` in a `SQL` query
         * @param options
         * @returns A column `SELECT` statement that formats `SocketLink` string within a `SQL` query
         */
        static SOCKET(options?: Object): string;
        /**
         * Creates an `LIMIT` clause for use in a `SQL` query
         * @param limit The limit value
         * @returns The formatted clause
         */
        static LIMIT(limit: number): string;
        /**
         * Creates an `OFFSET` clause for use in a `SQL` query
         * @param offset - The offset value
         * @returns The formatted clause
         */
        static OFFSET(offset: number): string;

    }

}
