var Connect = require ('connect');
var Url = require('url');
var Path = require('path');
var Collection = require('./datamaster').Collection;
var Timeout = require('herstimeout');
var http = require('http');


function WebServer (root, realm, usermodule) {
  //this.data = new WebCollectionReplica(realm,true);
  this.data = new Collection();
  this.data.commit('init',[
    ['set',['nodes'],'dcp']
  ]);
  this.data.element(['nodes']).createRemoteReplica('master',undefined,realm,'local',true);
  this.data.attach('./sessionuserfunctionality',{realmName:realm});
  this.data.attach(usermodule);
  this.data.element(['nodes','master']).go();
	this.root = root;
  this.realm = realm;
}

WebServer.prototype.error_log = function (s) {
	console.error(s);
}

WebServer.prototype.connectionCountChanged = function(delta){
  this.connectionCount+=delta;
  var lccu = this.lastCCupdate;
  if(!lccu){
    lccu = Timeout.now();
    this.lastCCupdate = lccu;
  }
  var now = Timeout.now();
  if(now-lccu<10000){
    return;
  }
  this.lastCCupdate = now;
  this.data.commit('connection_count_changed',[
    ['set',['connectioncount'],[this.connectionCount,undefined,'system']]
  ]);
};


function startSocketIO(server){
  var io = require('socket.io').listen(server, { log: false });
  console.log('socket.io listening');
  io.set('authorization', function(handshakeData, callback){
    var username = handshakeData.query.username;
    var sess = handshakeData.query[dataMaster.fingerprint];
    console.log('sock.io incoming',username,sess);
    if(username && sess){
      var u = UserBase.findUser(username,dataMaster.realmName);
      if(!u){
        callback(null,false);
      }else{
        handshakeData.username = username;
        handshakeData.session = sess;
        callback(null,true);
      }
    }else{
      callback(null,false);
    }
  });
  io.sockets.on('connection',function(sock){
    var username = sock.handshake.username,
      session = sock.handshake.session,
      u = UserBase.findUser(username,dataMaster.realmName);
    //console.log(username,'sockio connected',session,'session',u.sessions);
    u.makeSession(session);
    u.sessions[session].setSocketIO(sock);
    sock.on('!',function(data){
      executeOnUser(u,session,data,sock);
    });
  });
};

WebServer.prototype.start = function (port) {
	port = port || 80;
	var self = this;
  this.connectionCount = 0;
  this.data.commit('web_server_starting',[
    ['set',['connectioncount'],[this.connectionCount,undefined,'system']]
  ]);
	var dcp_handler = function (req, res, next) {
		if (req.method != 'GET' /*&& req.method != 'POST'*/) { next(); return;} //that POST is fishy...
		var url = req.url;
    var purl = Url.parse(url,true);
    var urlpath = decodeURI(purl.pathname); //"including the leading slash if present" so we'll remove it if present...
    if (urlpath.charAt(0)==='/'){urlpath = urlpath.substring(1);}
    if(urlpath==='_'){
      urlpath = 'dumpData';
    }else if(urlpath==='!'){
      urlpath = 'executeOnUser';
    }else{
      next();
      return;
    }
		//var data = ((req.method == 'GET') ? purl.query : req.body) || {};
    res.connection.setTimeout(0);
    self.data.functionalities.sessionuserfunctionality.f[urlpath](purl.query,function(errcb,errparams,errmessage){
      if(errcb==='OK'){
        res.write(JSON.stringify(errparams[0]));
      }else{
        res.write(JSON.stringify({errorcode:errcb,errorparams:errparams,errormessage:errmessage}));
      }
      res.end();
    });
	};

  var app = Connect()
    .use(dcp_handler)
    .use(Connect.static(Path.resolve(this.root), {maxAge:0}));

	var srv = http.createServer(app);
  startSocketIO(srv);
  srv.on('connection',function(connection){
    self.connectionCountChanged(1);
    var _self = self;
    connection.on('close',function(){
      _self.connectionCountChanged(-1);
    });
  });
  srv.listen(port);
};

//module.exports = WebServer;

var serv = new WebServer(process.argv[3],process.argv[4],process.argv[5]);
serv.start(process.argv[2]);

//console.log(process.argv);
process.on ('message', function (m) {
	if ('die_right_now' === m) {
		setTimeout(function () {process.exit(0);}, 0);
	}
});
