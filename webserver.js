var Connect = require ('connect');
var Url = require('url');
var Path = require('path');
var WebCollectionReplica = require('./WebCollectionReplica');

function WebServer (root, realm, pam) {
  this.data = new WebCollectionReplica(realm);
	this.root = root;
	this.pam = pam;
}

WebServer.prototype.error_log = function (s) {
	console.error(s);
}

WebServer.prototype.start = function (port) {
	port = port || 80;
	var self = this;
  function connectionCountChanged(delta){
    var cce = self.data.element(['connectioncount']);
    if(!cce){return;}
    var cc = self.data.element(['connectioncount']).value();
    self.data.commit('connection_count_changed',[
      ['set',['connectioncount'],[cc+delta,undefined,'system']]
    ]);
  };
  this.data.commit('web_server_starting',[
    ['set',['connectioncount'],[0,undefined,'system']]
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
			if(typeof data.roles === 'string'){
				data.roles = data.roles.split(',');
			}
			if (!urlpath.length){
				try{
					res.connection.setTimeout(0);
					req.connection.setTimeout(0);
					//req.on('close', function () {self.master.inneract('_connection_status', data, false)});
					req.on('close', function () {self.data.removeUser(data)});
          data.cb = function(s){report_end (200,JSON.stringify(s));};
					return self.data.dumpQueue(data);
				}
				catch(e){
          console.log(e,e.stack);
					return report_error(e);
				}
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
          var po = {path:urlpath,params:paramobj};
          for(var i in data){
            po[i] = data[i];
          }
          var statuscb = function(errcode,errparams,errmess){
            if(!errcode){
              report_end(200,JSON.stringify({errorcode:0}));
            }else{
              report_end(200,JSON.stringify({errorcode:errcode,errorparams:errparams,errormessage:errmess}));
            }
          };
          po.statuscb = statuscb;
					self.data.invoke(po,statuscb);
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
    connectionCountChanged(1);
    connection.on('close',function(){
      connectionCountChanged(-1);
    });
  });
};

//module.exports = WebServer;

var serv = new WebServer(process.argv[3],process.argv[4]);
serv.start(process.argv[2]);

console.log(process.argv);


process.on ('message', function (m) {
	if ('die_right_now' === m) {
		console.log("Yes, masta', will die right now ....");
		setTimeout(function () {process.exit(0);}, 0);
	}
});
