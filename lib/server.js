const _ = require('./util')
const express = require('express')
const app = express()
const session = require('express-session')
const cookieParser = require('cookie-parser')
const sessionstore = require('sessionstore')
const fileUpload = require('express-fileupload')
const moment = require('moment')
const fs = require('fs')
const path = require('path')

exports.start = (port, https) => {
	port = port || process.argv[2] ||  process.env.CFG_PORT || _.config.port
	_.info('Application: %s', _.appid)

	app.use(cookieParser('foo'))
	app.use(express.urlencoded({extended: false }))
	app.use(express.json({limit:'50mb', paramterLimit:1000000}))
	

	// Serve the static files from the React app
	//_.c(__dirname)
	//app.use(express.static(path.join(__dirname, 'dist')));

	app.use(express.json(_.config.bodyParser && _.config.bodyParser.json || null))

	let sessionOptions = {
		secret: 'futu'
		, cookie: { maxAge: 60 * 60 * 1000, secure: false }
		, resave: false
		, saveUninitialized: true
		, rolling: true
		, name: _.config.name
	}

	if (_.config.session && _.config.session.store) {
		sessionOptions = _.extend(sessionOptions, _.config.session.options)

		if (_.config.session.store === 'redis') {   //AP 20180614
			_.info('Starting redis store')
			sessionOptions.store = new (require("connect-redis")(session))(_.config.session.storeOptions || null)
		}
	}

	sessionOptions.store = sessionOptions.store || sessionstore.createSessionStore();
	const sessionMiddleware = session(sessionOptions)

	app.use(sessionMiddleware)
	app.use(fileUpload());

	app.use((req, res, next) => {
		//res.setHeader('Cache-Control', 'public, max-age=3600000');
		// console.log(req.session)
		// req.session = {}

		if (!req.session) {
			req.session = {}
			_.e("NO SESSIONNNNNNNN")
			// return next(new Error('Req Session not exist')) // handle error
		}

		req.session.uid = req.session && req.session.passport ? req.session.passport.user : 'anonymous'
		if (_.config.testUser) {
			req.user = _.config.testUser;
		}

		//_.c('process request')

		if (req.url !== '/api')
			_.info('%s [%s] %s', moment().format('D/M h:mm:ss'),
				req.session && (req.session.uid.uid || req.session.uid), req.url)

		next()
	})

	app.get(/.svgz/, function (req, res, next) {
		res.set({ 'Content-Encoding': 'gzip' });
		next();
	});

	
	app.use(express.static(_.basepath + '/public'))
	app.use(express.static(_.basepath + '/reports'))
	app.use(express.static(_.basepath + '/dist'))

	_.info('Starting ut-node server ........');
	const options = _.config.https ? {
		key: fs.readFileSync(_.config.https.privatekey),	//'./privatekey.pem'
		cert: fs.readFileSync(_.config.https.certificate)	//'./certificate.pem'
	} : {};

	// Passport
	_.passport = require('passport');
	app.use(_.passport.initialize());
	app.use(_.passport.session());

	const { Strategy, ExtractJwt } = require('passport-jwt')

	_.passport.use(new Strategy({
		jwtFromRequest: ExtractJwt.fromHeader('token'),
		secretOrKey: process.env.UT_JWT_SECRET||_.config.jwt.secretOrKey,
		passReqToCallback: true
	}, (req, payload, done) => {
		req.user = payload
		return done(null, payload)
	}))

	_.passport.serializeUser((user, done) => done(null, user))
	_.passport.deserializeUser((user, done) => done(null, user))

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

exports.routing = () => {
	app.post("/api", (req, res) => {
		console.log('routing')
		return _.dispatch.api(req, res)
	})
	//app.get("/load/:module/:component/:func", (req, res) => _.dispatch.load(req, res))
}
