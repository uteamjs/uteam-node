// Module loading
// example
const _ = require('./util');
const fs = require('fs');
const path = require('path');
let _app = [];

module.exports = function (__appid__, app) {

	let p, key = __appid__ + (app ? '/' + app : '')

	if (!app) {
		p = path.join(_.appPath, __appid__)

	} else {
		const i = app.indexOf('?')

		if(i > 0)
			app = app.substring(0, i)

		if (_.config.localModule &&
			_.config.localModule.indexOf(__appid__) >= 0)
			p = path.join(_.appPath, 'src', __appid__, app)

		else
			p = path.join(__appid__, app)
	}
	//_.c('Require: ' + p)

	//p = (_.config.production ? 
	//		path.join(p, app + '.js') : 
	//p = path.join(p, app + '.js').replace(/\\/g, '/')

	try {
		let m

		try {
			m = require.resolve(p)

		} catch (e) {
			try {
				m = require.resolve(path.join(_.basepath, 'node_modules', p))
			
			} catch(e) {
				//_.log(_.basepath)
				m = require.resolve(path.join(_.basepath.replace('/packages/main', ''), 'node_modules', p))
			}
		}

		let t = (new Date(fs.statSync(m).mtime)).getTime()
		//_.d(key, t, _app[key] || 'n/a')

		const _require = action => {
			_.info(`${action}oading module +++ /${key}`.brightWhite)
			const _mod = { m: require(m), t }

			if (_mod.m.no_cache)
				_.m('no_cache = %s', _mod.m.no_cache)

			if (!_.isUndefined(_mod.m.no_cache) && _mod.m.no_cache)
				_mod.t = 0

			_app[key] = _mod
		}

		if (_.isUndefined(_app[key]))
			_require('L')

		else if (t > _app[key].t) {
			delete require.cache[m]
			_require('Rel')
		}

		return _app[key].m;


	} catch (e) {
		//.c(e)
		_.m(e.message);
		return null;
	}
}
