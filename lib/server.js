const _ = require('./util')
const express = require('express')
const app = express()
const session = require('express-session')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')

//const fileUpload = require('express-fileupload')
const moment = require('moment')
const fs = require('fs')
const path = require('path')

function _exclude(url, body = { type: '' }) {
	if (!url)
		return false

	if (url.match(/\b(login|logout|logindirect)\b/) ||
		_.config.allowAnonymousAccount)
		return true

	for (let i in _.config.excludeRoute) {
		if (url.indexOf(_.config.excludeRoute[i]) >= 0 ||
			body.type.indexOf(_.config.excludeRoute[i]) >= 0)
			return true
	}

	return false
}

exports.start = (port, https) => {
	port = port || process.argv[2] || process.env.CFG_PORT || _.config.port
	_.info('Application: %s', _.appid)

	app.use(cookieParser('foo'))

	app.use(bodyParser.urlencoded({ extended: false }))

	app.use(bodyParser.json(_.config.bodyParser ||
		{ limit: '50mb', paramterLimit: 1000000 }))

	let sessionOptions = {
		secret: 'ute@m',
		cookie: { maxAge: 60 * 60 * 1000, secure: false },
		resave: false,
		saveUninitialized: true,
		rolling: true,
		name: _.config.name
	}

	if (_.config.session?.store) {
		sessionOptions = _.merge(sessionOptions, _.config.session.options)

		if (_.config.session.store === 'redis') {
			_.info('Starting redis store')
			sessionOptions.store = new (require("connect-redis")(session))(_.config.session.storeOptions || null)
		}
	}

	if (!sessionOptions.store)
		sessionOptions.store = require('sessionstore').createSessionStore()

	const sessionMiddleware = session(sessionOptions)

	app.use(sessionMiddleware)

	if (_.config.cors) {
		const cors = require("cors")
		app.use(cors(_.config.cors))
	}

	// Setup passport
	let jwt

	if (_.config.passport?.jwt) {
		jwt = require('jsonwebtoken')

		const p = _.isObject(_.config.passport.jwt) ? _.config.passport.jwt : {}

		p.secret = p.secret || process.env.UT_JWT_SECRET || p.secretOrKey
		p.buffer = new Buffer.from(p.secret, 'base64').toString()
		p.options = p.options || { expiresIn: '10m' }
	}

	app.use((req, res, next) => {

		// Setup header if any
		if (_.config.header)
			res.header(_.config.header)

		if (!req.session) {
			_.e("NO SESSIONNNNNNNN")
			req.session = {}
			// return next(new Error('Req Session not exist')) // handle error
		}

		req.session.uid = req.session && req.session.passport ?
			req.session.passport.user : 'anonymous'

		if (_.config.testUser)
			req.user = _.config.testUser;

		// API message will be logged further down the code
		if (req.url !== '/api')
			_.info('%s [%s] %s',
				moment().format('D/M h:mm:ss'),
				req.session && (req.session.uid.uid || req.session.uid),
				req.url)

		if (_.config.passport) {
			const p = _.config.passport.jwt

			// Api with jwt
			if (p && (req.url === '/api' || req.url === '/validatesession'))
				return _.passport.authenticate('jwt', { session: false },
					(error, token, info) => {
						//_.log(error)
						//_.log(user)
						//_.log(info)

						// important: 'jwt' return user = false if error
						if (!token || error !== null) {

							if(req.url == '/api')
								_.log(req.body)
							
							_.log(jwt.decode(req.get('token'), p.buffer))

							//info.token = req.get('token')
							_.c('JWT fail - ' + JSON.stringify(info))
							return res.status(401).json({
								message: 'Please login again, ' + (
									info?.message.replace('jwt', 'session') ??
									error?.message ??
									'session expired!'
								)
							})
						}
						else {	//Extend Token

							res.setHeader("Access-Control-Expose-Headers", 'token')
							res.setHeader('token', jwt.sign({uid: token.uid}, p.secret, p.options))

							if (req.url === '/api') {
								req.session.uid = token.uid
								req.session.user = token
							}

							return req.url === '/validatesession' ?
								res.status(200).json(token) :
								next()
						}
					})(req, res, next)

			// Excluded url or Passport authenticated with session 
			else if (_.config.excludeStaticPage || _exclude(req.url) || req.session?.passport?.user)
				return next()

			// Unauthenticated
			else if (req.url === '/api' || req.url === '/validatesession') {

				// To handle cross-domain stuff=hkl,
				if (req.method === 'OPTIONS')
					return res.json({ type: 'preflight' })

				_.e('Unauthorized acceess ' + req.url + '/' + req.body?.type || '')

				return res.status(401).json({
					message: 'Unauthorized acceess or Login timeout!'
				})

			} else {
				_.info('redirect ... login.html')
				return res.status(401).redirect('/login.html')
			}

		} else
			next()
	})

	app.get(/.svgz/, function (req, res, next) {
		res.set({ 'Content-Encoding': 'gzip' })
		next()
	})

	_.info('Starting ut-node server ........')
	const options = _.config.https ? {
		key: fs.readFileSync(_.config.https.privatekey),	//'./privatekey.pem'
		cert: fs.readFileSync(_.config.https.certificate)	//'./certificate.pem'
	} : {}

	if (_.config.passport) {
		_.info('Passport authen enabled')

		// Passport
		_.passport = require('passport')
		app.use(_.passport.initialize())
		app.use(_.passport.authenticate('session'))

		_.module('system', 'authen')

		_.isAuthen = (req, res, next) => {
			if (req.session?.passport?.user)
				next()
			else {
				_.info('redirect ... ' + _.config.loginPage || '/login.html')
				res.redirect(_.config.loginPage || '/login.html')
			}
		}
	} else
		_.isAuthen = (req, res, next) => next

	app.use(express.static(_.basepath + '/public'))
	app.use(express.static(_.basepath + '/reports'))
	app.use(express.static(_.basepath + '/dist'))

	const server = (https && _.config.https !== undefined) ?
		require('https').Server(options, app) :
		require('http').Server(app)

	_.httpserver = server

	// Socket.io
	if (_.config.socket) {
		const io = require('socket.io')(server)

		_.info("Enable socket service")
		_.io = io

		io.use((socket, next) => sessionMiddleware(socket.request, socket.request.res, next))

		io.on('connection', socket => {
			_.m("[%s] socket connected", socket.request.session.uid)
			//req.session.socket = socket
			socket.on('request', body => {
				let req = {
					session: socket.request.session,
					body, socket, io
				}
				_.dispatch.api(req, {
					end: () => { },
					socket: () => socket.emit('respond', _.extend(req.body, { server: 'respond' }))
				}
				)
			})

			socket.on('disconnect', () => _.m("[%s] socket disconnected", socket.request.session.uid))
		})

		if (_.socketExtend)
			_.socketExtend(io)
	}

	server.listen(port, _.config.address || '127.0.0.1',
		error => _.info(error ? error : "Listening on port %s.", port))

	// Routing setup
	require('./routing')(app)
	return app
}