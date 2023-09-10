const _ = require('./util')
const { createSqlSeries } = require('./database')

const pool = require('mariadb/callback').createPool(_.config.db)

pool.on('connection', function (connection) {
    _.info('MariaDB - connected')
    //connection.query('SET SESSION autocommit=1')
    //connection.query('SET SESSION sql_mode=NO_ENGINE_SUBSTITUTION')
})

pool.on('error', function (err) {
    _.e('Error at query', err)
    process.exit(-1)
})

_.sqlseries = createSqlSeries(null,
    db => (sql, param, cb) =>               
        db.getConnection((err, conn) => {
            if (err) {
                conn.close()
                return cb(err)
            }

            conn.query(sql, param, (err, rows) => {
                conn.close()
                cb(err, rows)
            })
        }),
    pool
)

module.exports = pool

