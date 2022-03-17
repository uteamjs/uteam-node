const _ = require('./util')
const jwt = require('jsonwebtoken')

const moment = require('moment')
const passport = require('passport')

module.exports = app => {

    app.use((req, res, next) => {
        req.application = { id: _.config.name }
        req.user = { uid: _.config.allowAnonymousAccount || 'anonymous' }

        next(null)
    })

    //if(_.config.authenApi)
    const _authenApi = _.module('system', 'authenApi')

    if (_authenApi)
        app.use((req, res, next) => _authenApi.preProcess(req, res, next))

    if (_.config.passport) {
        const pass = _.config.passport

        app.post('/login_old',
            _.passport.authenticate(_.config.auth || 'local', {
                successRedirect: _.config.homePage || '/',
                failureRedirect: '/login.html'
            })
        )

        app.post('/login',
            (req, res, next) => _.passport.authenticate(_.config.auth || 'local',
                (err, user, info) => {
                    if (!user) {
                        res.cookie('authenerr', info, {maxAge: 1000, httpOnly: false})
                        return res.redirect('/login.html')
                    }

                    req.logIn(user, e => {
                        if (e) return next(e)
                        res.redirect(_.config.homePage || '/')
                    })
                })(req, res, next)
        )

        app.post('/loginJwt',
            (req, res, next) => _.passport.authenticate(_.config.auth || 'local',

                (err, user, info) => {

                    if (err) return next(err)

                    if (!user) {
                        req.session.error = info
                        return res.redirect('/login.html')
                    }

                    _.c('login success... %s', req.session.url || (_.config.landingPage || '/'))

                    req.logIn(user, e => {
                        if (e) return next(e)

                        if (pass.jwt) {
                            const payload = {
                                uid: req.user,
                                expires: Date.now() + 1000 * 3600 * 24 * 90
                            }
                            const token = jwt.sign(JSON.stringify(payload), process.env.UT_JWT_SECRET || _.config.jwt.secretOrKey);
                            res.send(token)

                        } else {
                            res.redirect(_.config.homePage || '/')
                        }
                    })

                })(req, res, next),
            (req, res, next) => _.module('system', 'authenApi').postLogin(req, res, next),
        )

        app.get('/logout/:p?',
            (req, res, next) => _.module('system', 'authenApi').postLogout(req, res, next),
            (req, res) => {
                _.c('sign out')
                req.logout();
                req.session.destroy(err => {		//AP 20160613
                    _.c('Session distroy ... %s', err)
                    res.clearCookie('connect.sid');         //AP 20160613
                    res.redirect(_.config.logoutPage || _.config.loginPage || '/login.html');
                })
            }
        )
    }

    app.post('/api', _.dispatch.api)
}
