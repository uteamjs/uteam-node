const _ = require('./util')
const { createSqlSeries, genpool } = require('./database')
const oracledb = require('oracledb')
const crypto = require('crypto')
const async = require('async')

const conns = [];
let waitUntil = null;

oracledb.fetchAsString = [oracledb.CLOB];
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

_.info('Oracle driver loaded')

const validatePool = (conn, cb) => {
    if (!conn) return cb(false);
    let now = new Date().getTime();
    let validateSql = _.config.dbPool && _.config.dbPool.validateSql ?
        _.config.dbPool.validateSql :
        "select 'connection check' from dual"

    if (waitUntil && now < waitUntil)
        setTimeout(() => conn.execute(validateSql, (err, docs) => {
            if (err)
                cb(false);
            else
                cb(true);
        }), waitUntil - now)

    else
        conn.execute(validateSql, (err, docs) => cb(err ? false : true))
}

//e.g. https://emn178.github.io/online-tools/sha256.html
//     uteam-eform, c586367d1c2b7d0546c412b6690dcd06a20dcd4284afaa022c3cbca529508b3d
//e.g. https://www.devglan.com/online-tools/aes-encryption-decryption
//     123456, CBC, 128, iv 46c412b6690dcd06. key c586367d1c2b7d05, hex 7FB9A2F3E710DF541C38BF0FFEF93763

const decrypt = (s, secret) => {
    if(_.config.descryptDB){
        const h = _.hash(_.config.name);
        const decipher = crypto.createDecipheriv(
                            'aes-128-cbc', h.slice(0, 16), 
                            secret || h.slice(16, 32));
        let decrypted = decipher.update(s, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } else return s;
}

const pool = genpool({
    create: () => {
        return new Promise(function (resolve, reject) {
            let conn = null;
            let retryMillis = _.config.dbPool.connectRetryMs || 5000;
            let count = 0;
            oracledb.autoCommit = true;
            oracledb.outFormat = oracledb.OBJECT;


            const _log = (err, cb, msg) => {
                _.m(msg)
                _.e(err)
                cb('RETRY_CONNECTION')
            }

            const _execError = (cn, cb, msg) => err => {
                if (err)
                    _log(err, msg)

                else
                    cb(null, cn)
            }

            async.whilst(
                // While Condition
                // async need to add for ver 3.2.1
                cb =>  {
                    const _r = count !== -1 && count < 60 * 1000 / retryMillis
                    if(cb)
                        cb(null, _r)
                    else
                        return _r
                },
                // While loop
                cb => {
                    //_.c('create pool - while loop')

                    if (count !== -1) count++;
                    let { user, password, secretUser, secretPassword,
                        connectString, host, port, service,
                        currentSchema } = _.config.db
                    
                    user = process.env.UT_DB_USR || user
                    password = process.env.UT_DB_PWD || password
                    secretUser = process.env.UT_DB_SECRET_USR || secretUser
                    secretPassword = process.env.UT_DB_SECRET_PWD || secretPassword
                    host = process.env.UT_DB_HOST || host
                    port = process.env.UT_DB_PORT || port
                    service = process.env.UT_DB_SERVICE || service
                    connectString = process.env.UT_DB_CONNECT_STRING || connectString
                    currentSchema = process.env.UT_DB_SCHEMA || currentSchema

                    async.waterfall([
                        cb1 => {
                            oracledb.getConnection(
                                {
                                    user: user || decrypt(secretUser),
                                    password: password || decrypt(secretPassword),
                                    connectString: connectString || `${host}:${port}/${service}`,
                                },
                                function (err, cn) {
                                    if (err)
                                        _log(err, cb1, 'connect error')

                                    else {
                                        if (cn.sid || cn.transactionStatus) {
                                            _.c('connect err reserved sid/transactionStatus');
                                            return cb1('connect err reserved sid/transactionStatus');
                                        }
                                        cb1(null, cn);
                                    }
                                })
                        },

                        (cn, cb1) => cn.execute(`alter SESSION set NLS_DATE_FORMAT = 'YYYY-MM-DD HH24:MI:SS'`,
                            _execError(cn, cb1, 'set date format error')),

                        (cn, cb1) => {
                            if (!currentSchema)
                                return cb1(null, cn)

                            cn.execute(`alter SESSION set CURRENT_SCHEMA = ${currentSchema}`,
                                _execError(cn, cb1, 'set current schema error'))

                        },

                        (cn, cb1) => {
                            cn.execute(`select sys_context('USERENV','SID') as sid from dual`,
                                (err, doc) => {
                                    if (err || !doc.rows || doc.rows.length !== 1)
                                        _log(err, cb1, 'get sid error')

                                    else {
                                        conn = cn
                                        conn.sid = doc.rows[0].SID
                                        _.c('connected oracle DB...');
                                        count = -1;
                                        cb1()
                                    }
                                }
                            )
                        }
                    ], (err) => {
                        if (err === 'RETRY_CONNECTION')
                            setTimeout(cb, retryMillis)

                        else
                            cb(err)
                    })
                },

                // Exit While
                (err, n) => {
                    //return conn;

                    if (count === -1)
                        resolve(conn);
                    else
                        reject("connection failure");
                }
            )
        })
    },
    destroy: (connection) => {
        return new Promise(function (resolve, reject) {
            if (connection) {
                connection.close()
                resolve(connection)
            }
            else
                reject(connection)
        })
    },
    validate: _.config.dbPool && _.config.dbPool.validateConnection ? (conn) => {
        return new Promise(function (resolve) {
            /* stuff */
            validatePool(conn, resolve)
        })
    } : undefined
})

_.sqlseries = createSqlSeries(pool, conn => (sql, param, cb) => conn.execute(sql, cb))

module.exports = pool