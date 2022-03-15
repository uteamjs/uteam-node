const _ = require('lodash')
const winston = require('winston')
const { splat, combine, simple } = winston.format
const path = require('path')
const colors = require('colors')
const crypto = require('crypto');
const async = require('async')

const log = winston.createLogger({
    format: combine(
        splat(),
        simple()
        //,myFormat
    ),
    transports: [
        new winston.transports.Console({
            level: 'debug',
            colorize: true
        }),
    ]
})

log.level = 'debug'

_.version = '2.0.0'

_.pathjoin = function () {
    return path.join.apply(this, arguments).replace(/\\/g, '/')
}

_.hash = function (s) {
    try {
        if (!s)
            throw new Error();
        return crypto.createHash('sha256').update(s).digest('hex');
    } catch (e) {
        _.c(e.stack);
        return '';
    }
};

const _getModuleFile = s => {
    let i

    if (s.match(/uteam-node/)) {
        i = s.indexOf('uteam-node') + 11
    } else {
        i = s.indexOf(_.packagepath) + _.packagepath.length
    }

    return colors.grey(s.substring(i).replace(/src\/|lib\//, '')
        .replace(')', ''))
}

const _filterStack = s => {
    const _reg = new RegExp(_.packagepath + '|uteam-node')
    //console.log(s)
    s = s.filter(t => !t.match(/linuxCaller|callLog|Function\.. |node_modules|_\..|util\.js/) &&
        t.match(_reg))

    //console.log(s)
    s = s.map(t => _getModuleFile(t)).toString()
    return s.replace(/,/g, ' < ')
}

const linuxCaller = () => _filterStack((new Error()).stack.split('\n'))
const windowCaller = linuxCaller

const _getColor = {
    'info': 'green',
    'debug': 'yellow',
    'error': 'red',
    'warn': 'magenta'
}

function callLog(tp, argv) {
    var s;
    var i = 0, n = 0;
    if (_.isNumber(argv[0])) {
        i = 1
        n = argv[0]
    }

    if (_.isObject(argv[i])) {
        try {
            s = '\n' + JSON.stringify(argv[i], null, 2);    //AP 20160623
        } catch (e) {
            s = argv[i]
        }
    } else
        s = argv[i]

    argv[0] = ('linux|darwin'.indexOf(process.platform) >= 0 ? linuxCaller(n) : windowCaller(2 + n))
        + colors[_getColor[tp] || 'reset']('\n>> ' + s);

    log[tp].apply(log, argv);
}

_.e = _.postError = e => {
    if (_.isString(e))
        e = new Error(e)

    log.error(_filterStack(e.stack.split('\n'))
        + colors[_getColor.error]('\n>> ' + e.message))
}

// Error 
//_.e = function (err) {
//    log.error(log, [_filterStack(err.stack.split('\n')) +
//        colors[_getColor['error'] || 'reset']('\n>> ' + err.message)])
//}

// Debug
_.d = function () {
    if (_.config.isDebug !== false)     //AP 20160623
        callLog('debug', arguments);
}

const _logLineNumber = function (tp) {
    return function () {
        callLog(tp, arguments)
    }
}

// warning, log
_.m = _logLineNumber('warn')
_.c = _logLineNumber('info')

_.log = _.c
_.warn = _.m
_.error = _.e

_.info = function () {
    arguments[0] = ('>> ' + arguments[0]).cyan
    console.log.apply(console.log, arguments)
}

_.isInvalid = function (s) {
    return _.isUndefined(s) || _.isEmpty(s) || s === null || s === 'undefined';
}

_.parse = function (s) {
    if (_.isUndefined(s) || _.isInvalid(s))
        return null

    let json = null
    try {
        json = JSON.parse(s)

    } catch (e) {
        _.c(s)
        _.e(e)
    }

    return json
}

_.capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''


_.series = list => cb => async.series(list, cb)

_.iff = (cond, func, f2) => cb => {

    if (cond) {
        try {
            func(cb)

        } catch (e) {
            cb(e.message)
        }
    } else {
        if (f2) {
            try {
                f2(cb)

            } catch (e) {
                cb(e.message)
            }
        } else
            cb()
    }
}

_.step = func => cb => {
    try {
        func(cb)
    } catch (err) {
        _.e(err)
        cb()
    }
}

module.exports = _