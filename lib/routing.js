const _ = require('./util')
const jwt = require('jsonwebtoken')
const moment = require('moment')
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

        app.post('/login',
            _.passport.authenticate(_.config.auth || 'local', {
                successRedirect: _.config.homePage || '/',
                failureRedirect: '/login.html'
            })
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

    // Api handle
    /*
    if (_.config.passport?.jwt)
        app.post('/api',
            (req, res, next) => _exclude(req.url, req.body) ? next() :
                _.passport.authenticate('jwt', { session: false }, (error, user, info) => {
                    if ((!user || error) && info) {
                        info.token = req.get('token')
                        _.c(info)
                        return res.redirect(401, _.config.defaultRedirect || '/login.html')
                    }
                    else {
                        //Extend Token
                        let data = process.env.UT_JWT_SECRET || _.config.jwt.secretOrKey//'eDhvQlVBeVdxeGpLZmpiMkpBSjNDWENJbUppRjcxNXY=';
                        let buff = new Buffer.from(data, 'base64');
                        let key = buff.toString('ascii');
                        let _jwt = req.get('token')
                        let _token = jwt.decode(_jwt, key)
                        _.c(_token)
                        _token.exp = Math.floor((Date.now() + 1000 * (_.config.extendToken || 1800)) / 1000)
                        _jwt = jwt.sign(_token, process.env.UT_JWT_SECRET || _.config.jwt.secretOrKey);
                        res.header('token', _jwt)
                        return next()
                    }
                })(req, res, next),
            (req, res, next) => _.module('system', 'authenApi').postApi(req, res, next),
            _.dispatch.api
        )
    else */

    app.post('/api', _.dispatch.api)

}
