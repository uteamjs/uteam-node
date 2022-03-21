const _ = require('./util')
const { createSqlSeries } = require('./database')

const { Pool, types } = require('pg')

const conn =  new Pool(_.config.db)

// Don't convert date to UTC format
types.setTypeParser(1082, val => {
    return val
})

conn.on('error', function(err) {
    _.e(err)
    process.exit(-1)
})

conn.connect((err, client, done) => {
    if(err) {
        _.e(err)
        process.exit(-1)
    }
    client.query('select version()', (err, req) => {
        _.info('Database connected\n', req.rows[0].version)
        done()
    })
})

_.sqlseries = createSqlSeries(conn,
    (db) => (sql, param, cb) => 
        db.query(sql, _.isEmpty(param) ? [] :  param, cb)
)

module.exports = conn
