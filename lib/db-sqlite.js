const _ = require('./util')
const { createSqlSeries } = require('./database')
const sqlite3 = require('sqlite3').verbose()

const db = new sqlite3.Database(_.config.db.file, err => {
    if (err) {
        _.e('Sqlite initialization error', err)
        process.exit()
    }
    else 
        _.info(`sqlite '${_.config.db.file}' - connected`)

})

_.sqlseries = createSqlSeries(null, // No pooling
    conn => (sql, param, cb) => conn.all(sql, param, cb),
    db)

module.exports = db


