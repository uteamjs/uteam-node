const _ = require('./util')
const moment = require('moment')
const async = require('async')
const genericPool = require('generic-pool')
const yamlsql = require('./yamlsql')
const { v4: uuidv4 } = require('uuid');

const genpool = factory => {
    const opt = {
        name: 'oracle',
        log: false,
        max: 50,
        min: 0,
        idleTimeoutMillis: 30000
    }
    return genericPool.createPool(factory, { ...opt, ..._.config.dbPool })
}

const createSqlSeries = (pool, query, db) => (callback, done) => (req, res, next) => {
    const _execute = conn => {
        // Initize if null
        req.body.payload = req.body.payload || {}

        const o = new sqlObject(req, res, query(conn))
        o.conn = conn;

        if (_.sqlseriesExtend)
            o.extend(_.sqlseriesExtend)

        async.waterfall(callback(o, req.body.payload, req, res), (error, result) => {
            if (pool)
                pool.release(conn)

            if (_.isFunction(done))
                done(req.body.payload, req, res)

            else if (_.isFunction(next)) {
                next(error)

            } else
                res.body()
        })

    }

    if (db)
        _execute(db)

    else
        pool.acquire()
            .then(_execute)
            .catch(err => {
                // handle error - this is generally a timeout or maxWaitingClients
                // error
                _.e(err)
                res.body()
            })
}

class sqlObject {
    querydateFormat = 'YYYY-MM-DD'

    constructor(req, res, dbQuery) {
        this.data = {}
        this.req = req
        this.res = res
        if (dbQuery)
            this.execSqlQuery = dbQuery

        this.setDebug = this.set('isDebug', false)
    }

    _getParam = (param = {}) => {
        let { module, page, func } = param
        const body = this.req.body
        const s = body.type.split('/')

        if (s.length === 3) {
            module = module || s[0]
            page = page || s[1]
            func = func || s[2]
        }

        //_.c(module)
        return { ...param, module, page, func, body }
    }

    //yamlQuery = ({module, page, func}) => cb => {
    yamlQuery = (param = {}) => cb => {
        const { yaml, body, page, func, where } = this._getParam(param)

        this.query(yamlsql.query(yaml[page][func], { where }), (d, e) => {
            body.payload.data = d
            cb()
        })()
    }

    yamlInsert = param => cb => {
        const { path, file, yaml, body, page, func, where, isNew, id = 'ID', data } = this._getParam(param)
        const p = body.payload
        const _yaml = !yaml ? _.apiInterface(path, file) : yaml

        //_.c(_yaml)
        //_.c(Object.keys(p).toString())

        p.isNew = isNew || Object.keys(p).toString().match(/,id$|,id,|^id,/i)
            ? false : true

        const [table, obj] = yamlsql.insert(_yaml[page][func], { data, where })

        //obj[id] = isNew ? uuidv4(): p[id]
        obj[id] = p[id]
        //_.c(obj)
        //_.c(table)
        this.updateInsertLog(isNew, p.ID, table, obj, null, null, where)(cb)
    }

    formatdate = value => moment(value).format('D MMM YYYY')

    querydate = value => moment(value).format(_.querydateFormat)

    dateRange = (from, to, col) =>
        `( ${col || 'date'} between '${_.querydate(from)}' and '${_.querydate(to)})' `

    isNumeric = n => /^[+-]?([0-9]*[.])?[0-9]+$/.test(('' + n).toString().trim())

    info = msg => cb => {
        this.req.info(msg)
        cb()
    }

    warn = msg => cb => {
        this.req.warn(msg)
        cb()
    }

    error = (err, msg, isExit) => this.req.error(err, msg, isExit)

    set = (key, value) => cb => {
        this.data[key] = value
        cb()
    }

    stop = cb => cb('stop')

    // Override by database provider
    execSqlQuery = (sql, param, cb) => {
        _.e('execSqlQuery not overrided')
        cb()
    }

    query = (sql, msg, f) => this.queryParam(sql, {}, msg, f)

    queryParam = (sql, param, msg, f) => cb => {
        let log_t

        // Shit parameters
        if (_.isFunction(msg)) {
            f = msg
            msg = null
        }

        const _callback = (docs, err) => {
            if (f) {
                try {
                    f(docs, err)

                } catch (e) {
                    this.error(e, 'Post query error:')
                }
            }

            if (cb)
                cb()
        }

        if (_.config.db.logTime)
            log_t = new Date()

        if (this.data.isDebug) {
            _.d(sql)
            return _callback()
        }

        this.execSqlQuery(sql, param, (err, docs) => {
            if (_.config.db.logTime)
                _.c(`Execution time: ${(new Date()) - log_t}ms\n${sql}`)

            if (this.data.isDebug)
                _.d(docs)

            if (cb)
                this.req.error(err, sql, msg, true)

            this.sql = sql

            if (!err || !cb)
                _callback((docs && docs.rows) ? docs.rows : docs, err)
        })
    }

    _escapeKey = t => t.match(/\b(table|action)\b/i) ? `\`${t}\`` : t
    _escapeValue = t => _.isNumber(t) || t.match(/\b(now\(\))/i) ? t : `'${t}'`

    _fieldValue = obj => {
        _.c(_.values(obj))
        const fields = _.keys(obj).map(t => this._escapeKey(t)).toString()
        const values = _.values(obj).map(t => { return t ? this._escapeValue(t) : 'null' }).toString()

        return `(${fields}) values (${values})`
    }

    _setFieldValue = obj =>
        Object.entries(obj).reduce((t, [key, value]) => {
            if (typeof value != 'undefined')
                return t.concat(`, ${this._escapeKey(key)} = ${this._escapeValue(value)}`)
            else
                return t.concat('')
        }
            , '').slice(1)

    updateLogTable = (pid, table, action) => cb =>
        this.query('insert into updates ' + this._fieldValue({
            pid, table,
            uid: this.req.user.uid,
            action, timestamp: 'NOW()'
        }))(cb)

    updateInsertLog = (isInsert, id, table, obj, msg, f, where) => cb => {
        if (_.isFunction(msg)) {
            f = msg
            msg = null
        }

        let sql = ""

        if (isInsert)
            sql = `insert into ${table} ${this._fieldValue(obj)}`

        else {
            delete obj.ID

            if (_.isEmpty(obj))
                return cb()

            if (where)
                sql = `update ${table} set ${this._setFieldValue(obj)} where ${where}`
            else
                sql = `update ${table} set ${this._setFieldValue(obj)} where id='${id}'`
        }

        this.query(sql, msg, f)(cb)
    }

    updateInsert = (isInsert, where, table, obj, msg, f) => cb => {
        if (_.isFunction(msg)) {
            f = msg
            msg = null
        }

        const [fid, id] = _.isObject(where) ?
            Object.entries(where)[0] : ['id', where]

        let sql = ""

        if (isInsert || !id) {
            if (!id)
                obj[fid] = uuidv4()
            sql = `insert into ${table} ${this._fieldValue(obj)}`
        }

        else {
            delete obj.ID

            if (_.isEmpty(obj))
                return cb()

            sql = `update ${table} set ${this._setFieldValue(obj)} where ${fid}='${id}'`
        }

        this.query(sql, msg, f)(cb)
    }


    extend = obj => _.extend(this, obj)
}

module.exports = { createSqlSeries, sqlObject, genpool }