// Module loading
// example
const _ = require('./util');
const fs = require('fs');
const path = require('path');
let _file = []

const message = (action, key) => {
    const txt = `${action}oading file +++ /${key}`
    _.info(txt.brightWhite ?? txt)
}

module.exports = function (file) {
    let p = file, k = file

    try {
        let t = (new Date(fs.statSync(p).mtime)).getTime()
        let _f = _file.find(t => t.k === k)

        if (!_f) {
            message('L', k)
            _f = { k, t, m: fs.readFileSync(p, 'utf-8') }
            _file.push(_f)

        } else if (t > _f.t) {
            message('Rel', k)
            _f.m = fs.readFileSync(p, 'utf-8')
            _f.t = t
        }

        return _f.m;

    } catch (e) {
        _.m(e.message);
        return null;
    }
}
