
const _ = require('./util')
const moment = require('moment')
const fs = require('fs')
const { log } = require('winston')

const _reqError = (req, res, cb) => {
	if (!req.body)
		req.body = {}

	if (!req.body.message)
		req.body.message = {
			//tp: 'info',
			//text:'',
			info: [],
			warn: [],
			error: []
		}

	const { message } = req.body

	// txt added
	// (err, cb) -- not support
	// (err, isExit [, cb])
	// (err, msg, isExit [, cb] )

	req.error = (err, msg, txt, isExit, cb) => {

		if (_.isBoolean(msg)) {
			cb = txt
			isExit = msg
			msg = null
			txt = null
			// For backward compatibility
		} else if (_.isBoolean(txt)) {
			cb = isExit
			isExit = txt
			txt = null
		}

		if (err) {
			_.e(err)

			if (txt)
				_.e(txt)

			if (msg)
				_.d(msg)


			message.tp = 'error';

			if (txt)
				message.error.push(txt)

			message.error.push((msg ? (msg + '\n') : '') + err.message || err)


			if (isExit === true) {
				res.body()

				if (cb)
					cb(err)	// Break async functions
			}

			return true

		} else {
			if (cb)
				cb()
			return false
		}
	}

	//req.info = msg => message.text = msg;
	req.info = msg => message.info.push(msg)
	req.warn = msg => message.warn.push(msg)
	req.err = msg => message.error.push(msg)

	/*
	req.warn = msg => {
		message.tp = 'warn'
		message.text = msg
	}*/

	req.message = (err, msg, errormessage) => {
		if (msg)
			req.info.push(msg)
		//message.text = msg

		if (_.isString(err))
			return message.error.concat(err)

		req.error(err, errormessage)
	}

	res.next = cb => (err, doc) => {
		req.error(err, true)
		cb(doc)
	}

	cb(req, res)
}

exports.api = function (req, res) {
	const obj = res ? req.body : req

	let n = obj.type.split('/')
	let mod = _.module(n[0], n[1])

	const _logUrl = (type, msg = '') => {
		const _message = (apiType) =>
			`${moment().format('D/M h:mm:ss')} [%s] /${apiType}/%s/%s/%s${msg}`

		_[type](_message('api'), req.session && req.session.uid
			? (req.session.uid.uid || req.session.uid) : 'No Session UID Avaiable', n[0], n[1], n[2])
	}

	let noRespond = setTimeout(() => {
		_logUrl('m', ' --- not responding!!!')
		const { message, type } = req.body
		message.tp = 'error'
		message.error.push("'" + type +  "'\nAPI request timeout")
		res.json(req.body)
	},
		_.config.callbackTimeOut || 5000)

	try {
		_logUrl('info')

		if (res) {
			res.body = val => {
				//if (req.respondCalled) {
				//	_.m('respond already called');
				//	return;
				//}
				//req.respondCalled = true

				//if(API2 && val)
				//	req.body = _.extend(req.body || {}, val)

				if (val)
					req.body.payload = _.extend(req.body?.payload || {}, val)

				return res.json(req.body)
			}

			const s = _.pathjoin(_.appPath, 'preprocess.js')

			const preprocess = fs.existsSync(s) ?
				require(s) : next => (req, res) => next(req, res)

			const respond = {}

			const _respond = type => (obj, isReturn = false) => {
				if (req.respondCalled) {
					_.m('respond already called');
					return;
				}
				req.respondCalled = true
				//_.c('clearTimeout')
				clearTimeout(noRespond)
				res[type](obj)
				if (isReturn)
					return res
			}


			//_.c('call here...')
			//return mod['getMenu'](req, res)

			_reqError(req, {
				set: obj => {
					res.set(obj)
				},
				send: _respond('send'),
				body: _respond('body'),
				json: val => _respond('json')(val == null ? req.body : val),
				redirect: res.redirect,
				download: _respond('file'),
				end: _respond('end'),
				respond: res,
				on: res.on
			},
				preprocess((req, res) => mod[n[2]](req, res, req.session))
			)
		}
		else
			mod[n[2]]({ body: obj.payload }, { json: _.c })

	} catch (e) {
		_.info(`Unhandled error for module - ${n[0]}.${n[1]}.${n[2]}`)

		if (req.error)
			req.error(e)

		clearTimeout(noRespond)
		res.json(req.body)
	}
}
