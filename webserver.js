var Connect = require ('connect');
var Url = require('url');
var Path = require('path');
var WebCollectionReplica = require('./WebCollectionReplica');

function stripLeadingSlash(strng){
  if(strng.length&&strng[0]==='/'){
    return strng.slice(1);
  }else{
    return strng;
  }
};

function RequestHandler(functionality,request,response,urlpath,data){
  this.functionality = functionality;
  this.response = response;
  this.peekqueue = false;
  var t = this;
  functionality.findUser(data,function(errcode,errparams,errmessage){
    if(errcode==='OK'){
      t.user = errparams[0];
      t.session = errparams[1];
      var uo = {user:errparams[0],session:errparams[1]};
      var _func = functionality;
      request.on('close', function () {_func.deleteUserSession(uo)});
      t.process(urlpath,data);
    }else{
      this.responseobj = {errorcode:errcode,errorparams:errparams,errormessage:errmess};
      t.report_end();
    }
  });
};
RequestHandler.prototype.report_error = function(message){
  var res = this.response;
  if(res.writable){
    res.writeHead(503,{'Content-Type':'text/plain'});
    res.write(message);
  }
  res.end();
};
RequestHandler.prototype.report_end = function(){
  var res = this.response;
  if(!this.responseobj.username){
		/// don't bother me, I know I am unknown user ...
    //console.trace();
    //console.log(this.responseobj);
  }
  var message = JSON.stringify(this.responseobj);
  if(res.writable){
    var header = {'Content-Type':'text/plain'};
    if (message) header['Content-Length']= message.length;
    res.writeHead(200,header);
    res.write(message);
  }
  res.end();
};
RequestHandler.prototype.process = function(urlpath,data){
  this.responseobj = {results:[]};
  urlpath = stripLeadingSlash(urlpath);
  //console.log(urlpath,data);
  switch(urlpath){
    case 'executeDCP':
      var commands=[];
      var dcmds = data.commands;
      try{
        //console.log('data commands are',typeof dcmds,dcmds);
        commands = JSON.parse(dcmds);
      }
      catch(e){
        console.log('error JSON parsing',e,dcmds,typeof dcmds);
        this.errorcode='JSON';
        this.errorparams = [dcmds];
        this.report_end();
        return;
      }
      this.commandsdone = 0;
      if(commands.length%2){
        console.log('odd number of execute params');
        throw ('odd execute');
      }
      this.commandstodo = commands.length/2;
      for(var i =0; i< this.commandstodo; i++){
        var command = commands[i*2],params = commands[i*2+1];
        //console.log('command',command,'#',i,'of',this.commandstodo);
        this.execute(command,params,(function(index,t){
          var _i = index,_t=t;
          return function(errcode,errparams,errmessage){
            _t.responseobj.results[_i] = [errcode,errparams,errmessage];
            _t.commandsdone++;
            //console.log(_t.commandsdone,'commands done out of',_t.commandstodo);
            if(_t.commandsdone===_t.commandstodo){
              //console.log('finalizing');
              _t.finalize();
            }
          };
        })(i,this));
      }
      break;
    default:
      this.execute(urlpath,data,(function(t){var _t = t; return function(){_t.finalize();}})(this));
      break;
  }
};
RequestHandler.prototype.execute = function(command,paramobj,cb){
  if(!(command&&command.length)||command==='_'){
    cb();
    return;
  }
  this.peekqueue=true;
  switch(stripLeadingSlash(command)){
    case 'follow':
      this.user.follow(paramobj.path.slice());
      cb('OK',paramobj.path);
    break;
    case 'init':
    break;
    default:
      this.user.invoke(command,paramobj,cb);
    break;
  }
};
RequestHandler.prototype.finalize = function(){
  //console.log('finalizing with peek',this.peekqueue);
  var t = this;
  this.functionality.dumpUserSession({user:this.user,session:this.session},function(errcode,errparams,errmess){
    if(errcode==='OK'){
      t.responseobj.username = t.user.username;
      t.responseobj.roles = t.user.roles;
      t.responseobj.session = errparams[0][0];
      t.responseobj.data = errparams[0][1];
    }else{
      console.log('Ooops',errcode);
      t.responseobj = {errorcode:errcode,errorparams:errparams,errormessage:errmess};
    }
    t.report_end();
    for(var i in t){
      delete t[i];
    }
  },this.peekqueue);
};

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
    var purl = Url.parse(url,true);
    var urlpath = decodeURI(purl.pathname); //"including the leading slash if present" so we'll remove it if present...
		if (!urlpath.length) { next(); return; }
		if (urlpath==='/') { next(); return; }
		if (urlpath.indexOf('.') > -1) { next(); return; }
		if (req.method != 'GET' && req.method != 'POST') { next(); return;}
		var data = ((req.method == 'GET') ? req.query : req.body) || {};
    res.connection.setTimeout(0);
    req.connection.setTimeout(0);
    new RequestHandler(self.sessionfunctionality,req,res,urlpath,data);
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
process.on ('message', function (m) {
	if ('die_right_now' === m) {
		console.log("Yes, masta', will die right now ....");
		setTimeout(function () {process.exit(0);}, 0);
	}
});
