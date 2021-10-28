const _ = require('./util.js')
const path  = require('path')

_.appPath = path.dirname(module.parent.parent.filename)
console.log('\n')
_.info('Application path [%s]', _.appPath)

_.basepath = _.appPath
_.packagepath = _.basepath.substring(0, _.basepath.indexOf('packages/') + 9)
_.config = require(_.appPath + '/config.json')
_.appid = _.config.name;
_.module = require('./module')
_.dispatch = require('./dispatch');
_.server = require('./server')
_.readfile = require('./loadfile')

if(_.config.db)
    _.sql = require('./db-' + _.config.db.type)

module.exports = _

process.on('SIGINT', () => {
    _.m("\nShutting down from SIGINT (Ctrl-C)");
    process.exit(1);
});