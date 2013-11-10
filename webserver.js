var Connect = require ('connect');
var Url = require('url');
var Path = require('path');
var WebCollectionReplica = require('./WebCollectionReplica');

function WebServer (root, realm, pam) {
  this.data = new WebCollectionReplica(realm);
  this.sessionfunctionality = this.data.functionalities.sessionuserfunctionality.f;
	this.root = root;
  this.realm = realm;
	this.pam = pam;
}

WebServer.prototype.error_log = function (s) {
	console.error(s);
}

WebServer.prototype.connectionCountChanged = function(delta){
  this.connectionCount+=delta;
  var lccu = this.lastCCupdate;
  if(!lccu){
    lccu = (new Date()).getTime();
    this.lastCCupdate = lccu;
  }
  var now = (new Date()).getTime();
  if(now-lccu<10000){
    return;
  }
  this.lastCCupdate = now;
  this.data.commit('connection_count_changed',[
    ['set',['connectioncount'],[this.connectionCount,undefined,'system']]
  ]);
};

WebServer.prototype.start = function (port) {
	port = port || 80;
	var self = this;
  this.connectionCount = 0;
  this.data.commit('web_server_starting',[
    ['set',['connectioncount'],[this.connectionCount,undefined,'system']]
  ]);
	var map_resolver = function (req, res, next) {
		var url = req.url;
		function report_error (s) {
      if(!res.writable){return;}
			self.error_log(s);
			res.writeHead(503,{'Content-Type':'text/plain'});
      res.write(s);
			res.end();
		};
		function report_end (code, s) {
      if(!res.writable){return;}
			var header = {'Content-Type':'text/plain'};
			if (s) header['Content-Length']= s.length;
			res.writeHead(code,header);
			res.write(s);
			res.end();
		};
    function dump(s){
      report_end (200,JSON.stringify(s));
    };

    var purl = Url.parse(url,true);
    var urlpath = decodeURI(purl.pathname); //"including the leading slash if present" so we'll remove it if present...
    if(urlpath[0]==='/'){urlpath = urlpath.slice(1);}

		if (urlpath.indexOf('.') > -1) { next(); return; }

		if (req.method != 'GET' && req.method != 'POST') return report_end(503);
		var data = ((req.method == 'GET') ? req.query : req.body) || {};

		function do_da_request () {
			if (urlpath === 'init') {
				if(typeof data.functionality === 'undefined'){
					return report_error('Missing functionality name');
				}
				var fname = data.functionality;
				delete data.functionality;
				var key = data.key;
				delete data.key;
				var environmentmodulename = data.environment;
				delete data.environment;
				var conf;
				if(typeof data.config !== 'undefined'){
					try{
						conf = JSON.parse(data.config);
						console.log('initing with conf',conf);
					}
					catch(e){}
					delete data.config;
				}
				try{
					self.data.attach(fname,conf,key,environmentmodulename);
				}
				catch(e){
					return report_error(e.stack+"\n"+e);
				}
				return report_end(200,JSON.stringify({'status':'ok'}));
			}
			if (!urlpath.length){
        res.connection.setTimeout(0);
        req.connection.setTimeout(0);
        //req.on('close', function () {self.master.inneract('_connection_status', data, false)});
        data.cb = function(s){report_end (200,JSON.stringify(s));};
        self.sessionfunctionality.findUser(data,function(errcode,errparams,errmessage){
          if(errcode==='OK'){
            var uo = {user:errparams[0],session:errparams[1]};
            req.on('close', function () {self.sessionfunctionality.deleteUserSession(uo)});
            self.sessionfunctionality.dumpUserSession(uo,function(errcode,errparams,errmess){
              if(errcode==='OK'){
                report_end(200,JSON.stringify(errparams[0]));
              }else{
                report_end(200,JSON.stringify({errorcode:errcode,errorparams:errparams,errormessage:errmess}));
              }
            });
          }else{
            report_end(200,JSON.stringify({errorcode:errcode,errorparams:errparams,errormessage:errmess}));
          }
        });
        return;
			}

			var paramobj;
			if(typeof data.paramobj === 'string'){
				try{
					paramobj = JSON.parse(data.paramobj);
				}
				catch(e){}
			}else{
				paramobj = data.paramobj;
			}
			delete data.paramobj;
			//console.log('credentials',data,'method',urlpath,'paramobj',paramobj);
			setTimeout(function(){
				try{
          var statuscb = function(errcode,errparams,errmess){
            if(!errcode){
              report_end(200,JSON.stringify({errorcode:0}));
            }else{
              report_end(200,JSON.stringify({errorcode:errcode,errorparams:errparams,errormessage:errmess}));
            }
          };
          self.sessionfunctionality.findUser(data,function(errcode,errparams,errmessage){
            if(errcode==='OK'){
              if(urlpath==='follow'){
                errparams[0].follow(paramobj.path);
                statuscb('OK',paramobj.path);
              }else{
                self.sessionfunctionality.invokeOnUserSession({user:errparams[0],session:errparams[1],path:urlpath,paramobj:paramobj,cb:statuscb},statuscb);
              }
            }
          });
          return;
          var po = {path:urlpath,params:paramobj};
          for(var i in data){
            po[i] = data[i];
          }
          po.statuscb = statuscb;
					//self.data.invoke(po,statuscb);
				}
				catch(e){
					console.log(e.stack);
					console.log('GOTCHA',e);
					report_error(e);
				}},0);
		}

		if (!self.pam) return do_da_request();
		self.pam.verify (req, res, urlpath, data, do_da_request);
	};

	var srv = Connect.createServer (
			Connect.query(),
			Connect.bodyParser(),
			map_resolver,
			Connect.static(Path.resolve(this.root), {maxAge:0})
	).listen(port);
  //console.log(srv);
  srv.on('connection',function(connection){
    self.connectionCountChanged(1);
    var _self = self;
    connection.on('close',function(){
      _self.connectionCountChanged(-1);
    });
  });
};

//module.exports = WebServer;

var serv = new WebServer(process.argv[3],process.argv[4]);
serv.start(process.argv[2]);

console.log(process.argv);
