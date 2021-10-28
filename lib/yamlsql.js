const _ = require('./util')
const yaml = require('yaml')
const { readFileSync } = require('fs')
const { join } = require('path')
const moment = require('moment')


_.apiInterface = (folder, file = 'api.yaml') => {
    try {
        return yaml.parse(_.readfile(join(folder, 'api.yaml'))) || {}

    } catch (e) {
        _.e(e)
        return {}
    }
}

const listKeyValue = list => list.map(t => {
    const k = Object.keys(t)[0]
    return [k, t[k]]
})

/*  y - yaml segment relate to specific function
    param - where 
*/

exports.query = (y, param = {}) => {
    let len = 0
    let { where } = param

    const escape = s =>
        s === '' ? `''` : s

    const add = s => {
        len += s.length
        if (len > 65) {
            len = 0
            return '\n' + s
        }
        return s
    }

    if (y.table && !y.sql) {
        y.sql = 'select '
        len = y.sql.length

        if (y.fields)
            y.sql += y.fields.reduce((a, o, i) => {
                const k = Object.keys(o)
                const v = o[k[0]]

                if (i > 0) a += add(', ')

                // Assume 2nd property is case
                if (k.length > 1 && k[1].match(/case/i)) {      
                    const lst = listKeyValue(o[k[1]])
                    a += `case when ${escape(k[0])}='${lst[0][0]}'`
                        + ` then ${lst[0][1]} else ${lst[1][1]} end`
                } else
                    a += add(escape(k[0]))

                if (v) a += add(` as "${v}"`)

                return a
            }, '')

        else
            y.sql += '*'

        y.sql += y.table.reduce((a, v, i) =>
            a + (i > 0 ? (v.toLowerCase().indexOf('join') === 0 ?
                '\n' : '\n, ') : '') + v
            , '\nfrom ')

        if (where)
            y.sql += ' where ' + where

        _.c(y.sql)
    }

    //_.c(y.sql)
    return y.sql
}

// ** Replace
exports.insert = (y, param = {}) => {
    const { data } = param

    return [y.table[0], y.fields.reduce((a, o) => {
        const k = Object.keys(o)    // Column Name
        const v = o[k[0]]           // Data key name

        // Assume 2nd property is case
        // IS_WARRENTY: warranty
        // case: 
        //  - T: true
        //  - F: false

        if (k.length > 1 && k[1].match(/case/i)) {
            const lst = listKeyValue(o[k[1]])
            const r = _.find(lst, item => data[v] === item[1])
            // Check error here
            a[k[0]] = r?.[0]

        } else
            // Assume 2nd property is date
            a[k[0]] = k.length > 1 && k[1] === 'date' ?
                moment(data[v]).format(
                    o[k[1]].match(/default/i) ? 'YYYYMMDD HH:mm:ss' : o[k[1]]
                ) : data[v]

        return a
    }, {})]
}