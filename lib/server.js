const _ = require('./util')
const express = require('express')
const app = express()
const session = require('express-session')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const sessionstore = require('sessionstore')
const fileUpload = require('express-fileupload')
const moment = require('moment')
const fs = require('fs')
const path = require('path')
const passport = require('passport')

function _exclude(url, body = { type: '' }) {
	if (!url)
		return false

	if (url.indexOf('/login') === 0 || _.config.allowAnonymousAccount)
		return true

	for (var i in _.config.excludeRoute) {
		if (url.indexOf(_.config.excludeRoute[i]) >= 0 || body.type.indexOf(_.config.excludeRoute[i]) >= 0)
			return true;
	}

	return false;
}

exports.start = (port, https) => {
	port = port || process.argv[2] || process.env.CFG_PORT || _.config.port
	_.info('Application: %s', _.appid)

	app.use(cookieParser('foo'))
	app.use(bodyParser.json({ limit: '50mb', paramterLimit: 1000000 }))
	app.use(express.urlencoded({ extended: false }))

	app.use(express.json(_.config.bodyParser && _.config.bodyParser.json || null))

	let sessionOptions = {
		secret: 'ute@m'
		, cookie: { maxAge: 60 * 60 * 1000, secure: false }
		, resave: false
		, saveUninitialized: true
		, rolling: true
		, name: _.config.name
	}

	if (_.config.session && _.config.session.store) {
		sessionOptions = _.extend(sessionOptions, _.config.session.options)

		if (_.config.session.store === 'redis') {   
			_.info('Starting redis store')
			sessionOptions.store = new (require("connect-redis")(session))(_.config.session.storeOptions || null)
		}
	}

	sessionOptions.store = sessionOptions.store || sessionstore.createSessionStore();
	const sessionMiddleware = session(sessionOptions)

	app.use(sessionMiddleware)
	app.use(fileUpload());

	app.use((req, res, next) => {

		// Setup header if any
		if (_.config.header) 
            res.header(_.config.header)

		if (!req.session) {
			req.session = {}
			_.e("NO SESSIONNNNNNNN")
			// return next(new Error('Req Session not exist')) // handle error
		}

		req.session.uid = req.session && req.session.passport ?
			req.session.passport.user : 'anonymous'
		if (_.config.testUser) {
			req.user = _.config.testUser;
		}

		if (req.url !== '/api') 
			_.info('%s [%s] %s', moment().format('D/M h:mm:ss'),
				req.session && (req.session.uid.uid || req.session.uid),
				req.url)

		if (_.config.passport) {
			const pass = _.config.passport

			// Api with jwt
			if (req.url === '/api' && pass.jwt)
				return _.passport.authenticate('jwt', { session: false },
					(error, user, info) => {
						if ((!user || error) && info) {
							info.token = req.get('token')
							_.c('JWT fail - ' + info)
							return res.json({
								message: {
									info: 'Authentication',
									error: ['Login expired']
								}
							})
						}
						else {
							//Extend Token
							let data = process.env.UT_JWT_SECRET || _.config.jwt.secretOrKey//'eDhvQlVBeVdxeGpLZmpiMkpBSjNDWENJbUppRjcxNXY=';
							let buff = new Buffer.from(data, 'base64');
							let _token = jwt.decode(req.get('token'), buff.toString('ascii'))
							_token.exp = Math.floor((Date.now() + 1000 * (_.config.extendToken || 1800)) / 1000)
							const _jwt = jwt.sign(_token, process.env.UT_JWT_SECRET || _.config.jwt.secretOrKey);
							res.header('token', _jwt)

							return next()
						}
					})(req, res, next)

			else {
				// Passport authenticated with session
				if (_exclude(req.url) || req.session?.passport?.user)
					return next()

				// Unauthenticated
				else {
					if (req.url === '/api') {
						// To handle cross-domain stuff=hkl,
						if(req.method === 'OPTIONS')
							return res.json({ type: 'preflight'})	

						_.e('Unauthorized acceess ' + req.url + '/' + req.body?.type || '')
						req.body.message = {
							error: ['Unauthorized acceess or Login timeout!']
						}
						return res.json(req.body)
						/*return res.json({
							message: {
							  error: ['Unauthorized acceess or Login timeout!']
							}
						  })*/
					} else
						return res.redirect('/login.html')
				}
			}
		} else
			next()
	})

	app.get(/.svgz/, function (req, res, next) {
		res.set({ 'Content-Encoding': 'gzip' });
		next();
	});

	_.info('Starting ut-node server ........');
	const options = _.config.https ? {
		key: fs.readFileSync(_.config.https.privatekey),	//'./privatekey.pem'
		cert: fs.readFileSync(_.config.https.certificate)	//'./certificate.pem'
	} : {};


	if (_.config.passport) {
		_.info('Passport authen enabled')

		// Passport
		_.passport = require('passport')
		app.use(_.passport.initialize())
		app.use(_.passport.authenticate('session'))
		//session());

		_.module('system', 'authen')

		_.isAuthen = (req, res, next) => {
			if (req.session?.passport?.user)
				next()
			else
				res.redirect(_.config.loginPage || '/login.html')
		}
	} else
		_.isAuthen = (req, res, next) => next

	app.use(express.static(_.basepath + '/public'))
	app.use(express.static(_.basepath + '/reports'))
	app.use(express.static(_.basepath + '/dist'))

	const server = (https && _.config.https !== undefined) ?
		require('https').Server(options, app) :
		require('http').Server(app);

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