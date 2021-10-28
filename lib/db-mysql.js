const _ = require('./util')
const createSqlSeries = require('./database')

const conn = require('mysql').createPool(_.config.db)

conn.on('connection', function (connection) {
    _.info('mySql - connected')
    connection.query('SET SESSION autocommit=1')
    connection.query('SET SESSION sql_mode=NO_ENGINE_SUBSTITUTION')
})
  
conn.on('error', function(err) {
    _.e('Error at query', err)
})

_.sqlseries = createSqlSeries(null, 
    db => (sql, param, cb) => db.query(sql, cb),
    conn
)

module.exports = conn

