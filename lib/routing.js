const _ = require('./util')
const jwt = require('jsonwebtoken')
const moment = require('moment')

function _exclude(url, body={type:''}) {
    if(!url)
        return false
  
    if(url.indexOf('/login') === 0  || _.config.allowAnonymousAccount )
        return true

    for(var i in _.config.excludeRoute) {
      if(url.indexOf(_.config.excludeRoute[i]) >= 0 || body.type.indexOf(_.config.excludeRoute[i]) >= 0)
        return true;
    }
  
    return false;
  }

module.exports = (app) => {
	app.use((req, res, next) => {
        req.application = {id: _.config.name}
        req.user = {uid: _.config.allowAnonymousAccount || 'anonymous'}

        if(_.config.header){
            res.header(_.config.header)
            /*for(const [key, value] of Object.entries(_.config.header)){
                res.set(key, value)
            }
            console.log(res)*/
        }
           

        next(null)
	})

    //if(_.config.authenApi)
    const _authenApi = _.module('system','authenApi')

    if(_authenApi)
        app.use((req, res, next) => _authenApi.preProcess(req, res, next))

    app.post('/login', 
        _.passport.authenticate(_.config.auth || 'local', 
            {failureRedirect: _.config.defaultRedirect ||'/login.html', failureFlash:true}), 
        (req, res, next) => _.module('system','authenApi').postLogin(req, res, next),
        (req, res) => {
            //res.redirect('/#home') // req.session.url || '/#home');
            _.c('login success... %s', req.session.url || (_.config.landingPage ||'/#home'))
            const payload = {
                uid: req.user,
                expires: Date.now() + 1000 * 3600 * 24 * 90
            }
            
            const token = jwt.sign(JSON.stringify(payload), process.env.UT_JWT_SECRET||_.config.jwt.secretOrKey);
            res.send(token)
        }
    )

    app.get('/logout/:p?', 
        (req, res, next) => _.module('system','authenApi').postLogout(req, res, next),
        (req, res) => {
            _.c('sign out')
            req.logout();
            req.session.destroy(err => {		//AP 20160613
                _.c('Session distroy ... %s', err)
                res.clearCookie('connect.sid');         //AP 20160613
                res.end()
                //res.redirect(_.config.logoutPage||'#login');
            })
        }
    )

    if(_.config.jwt.disable)
        _.m('JWT diabled')

    app.post('/api', 
        _.config.jwt.disable ? 
            (req, res, next) => next() : 
            (req, res, next)=>{
                if(_exclude(req.url, req.body))
                    return next()
                else 
                    return _.passport.authenticate('jwt', {session: false},(error, user, info)=>{
                                if ((!user || error) && info){
                                    info.token = req.get('token')
                                    _.c(info)
                                    return res.redirect(401, _.config.defaultRedirect ||'/login.html')
                                }
                                else {
                                    //Extend Token
                                    let data = process.env.UT_JWT_SECRET||_.config.jwt.secretOrKey//'eDhvQlVBeVdxeGpLZmpiMkpBSjNDWENJbUppRjcxNXY=';
                                    let buff = new Buffer.from(data, 'base64');
                                    let key = buff.toString('ascii');
                                    let _jwt =req.get('token')
                                    let _token =jwt.decode(_jwt,  key)
                                    _.c(_token)
                                    _token.exp = Math.floor((Date.now() + 1000 * (_.config.extendToken||1800))/1000)
                                    _jwt = jwt.sign(_token, process.env.UT_JWT_SECRET||_.config.jwt.secretOrKey);
                                    res.header('token',_jwt)
                                    return next()
                                }
                        })(req, res, next)
        }, 
        (req, res, next) => _.module('system','authenApi').postApi(req, res, next),
        (req, res) => _.dispatch.api(req, res))
}
