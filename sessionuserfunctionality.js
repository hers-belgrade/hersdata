var RandomBytes = require('crypto').randomBytes;
var BigCounter = require('./BigCounter');
var util = require('util');
var Timeout = require('herstimeout');
var DataUser = require('./DataUser');

var errors = {
  'OK':{message:'OK'},
  'NO_SESSION':{message:'Session [session] does not exist',params:['session']},
  'NO_USER':{message:'No username was defined in request'},
  'NO_COMMANDS':{message:'No commands to execute'}
};

function SessionUser(data,username,realmname,roles){
  sessions = {};
  var t = this;
  DataUser.call(this,data,function(){},function(item){
    //console.log('<=',item);
    for(var i in t.sessions){
      if(!t.sessions[i].say){
        delete t.sessions[i];
      }
      if(t.sessions[i].say(item)===false){
        delete t.sessions[i];
      }
    }
  },username,realmname,roles);
  this.sessions = sessions;
}
SessionUser.prototype = new DataUser();
SessionUser.prototype.constructor = SessionUser;
SessionUser.prototype.makeSession = function(sess){
  if(!sess){
    console.trace();
    console.log('no session to make');
    process.exit(0);
  }
  if(this.sessions[sess]){return;}
  this.sessions[sess] = new ConsumerSession(this,sess);
};

function _findUser(username){
  return this.self.userMap[username];
}

function _produceUser(paramobj){
  if(!paramobj.name){
    return;
  }
  var u = this.self._findUser(paramobj.name);
  if(u){
    return u;
  }
  var user = new SessionUser(this.data,paramobj.name,this.self.realmName,paramobj.roles);
  this.self.userMap[user.username] = user;
  return user;
}

function dumpData(paramobj,statuscb) {
  var user = _produceUser.call(this,paramobj);
  //console.log('recognized',user.username,user.realmname,user.keys);
  if(!user){
    statuscb('NO_USER');
    return;
  }
  var sessid = paramobj[this.self.fingerprint];
  if(!sessid){
    sessid=this.self.newSession();
    console.log('created',sessid,'on',user.username,'because',this.self.fingerprint,'was not found in',paramobj);
  }
  //console.log(user.sessions);
  user.makeSession(sessid);
  var session = {};
  session[this.self.fingerprint]=sessid;
  statuscb('OK', {
    username:paramobj.name,
    roles:paramobj.roles,
    session:session,
    data:user.sessions[sessid] ? user.sessions[sessid].retrieveQueue() : []
  });
};
dumpData.params = 'originalobj';


function executeOneOnUser(user,command,params,cb){
  //console.log('executing',command, params);
  if(command==='_'){return;}
  if(command.charAt(0)===':'){
    command = command.substring(1);
    //console.log('user function',command);
    var method = user[command];
    if(!method){
      console.log('no method named',command,'on user');
      cb('NO_FUNCTIONALITY',method);
    }else{
      method.apply(user,Array.prototype.slice.call(arguments,2));
    }
    return;
  }
  user.invoke(this,command,params,cb); //this is data
}

function executeOnUser(user,session,commands,statuscb){
  var sessionobj = {};
  sessionobj[this.self.fingerprint]=session;
  var ret = {username:user.username,roles:user.roles,session:sessionobj};
  var cmdlen = commands.length;
  var cmdstodo = cmdlen/2;
  var cmdsdone = 0;
  for (var i=0; i<cmdstodo; i++){
    var cmd = commands[i*2];
    var po = commands[i*2+1];
    if(cmd.charAt(0)==='/'){
      cmd = cmd.slice(1);
    }
    var fp = this.self.fingerprint;
    executeOneOnUser.call(this.data,user,cmd,po,(function(index){
      var _i = index, _scb = statuscb;
      return function(errcode,errparams,errmessage){
        if(!ret.results){
          ret.results=[];
        }
        ret.results[_i] = [errcode,errparams,errmessage];
        cmdsdone++;
        if(cmdsdone===cmdstodo){
          var s = user.sessions[session];
          if(!s){
            console.log('NO_SESSION',session,user.sessions);
            _scb('NO_SESSION',session);
            return;
          }
          var so = {};
          so[fp] = session;
          ret.data=s ? s.retrieveQueue() : [];
          _scb('OK',ret);
        }
      };
    })(i));
  }
};
executeOnUser.params = ['user','session','commands'];

function produceAndExecute(/*user,session,commands,res*/paramobj,statuscb){
  var session = paramobj[this.self.fingerprint];
  if(!session){
    //console.log('no session in',paramobj);
    statuscb('NO_SESSION','');
    return;
  }
  var commands = paramobj.commands;
  if(!commands){
    statuscb('NO_COMMANDS');
    return;
  }
  if(typeof commands === 'string'){
    try{
      commands = JSON.parse(commands);
    }
    catch(e){
      statuscb('NO_COMMANDS');
      return;
    }
  }
  var user = _produceUser.call(this,paramobj);
  //console.log('recognized',user.username,user.realmname,user.keys);
  if(!user){
    statuscb('NO_USER');
    return;
  }
  this.self.executeOnUser({user:user,session:session,commands:commands},function(ecb,ep,em){
    statuscb(ecb,ep[0],em);
  });
};
produceAndExecute.params='originalobj';

function registerUserProductionCallback(cb,statuscb){
  if(this.self.userProductionCallbacks.indexOf(cb)<0){
    this.self.userProductionCallbacks.push(cb);
  }
};
registerUserProductionCallback.params=['cb'];

function unRegisterUserProductionCallback(cb,statuscb){
  var cbi = this.self.userProductionCallbacks.indexOf(cb);
  if(cbi>=0){
    this.self.userProductionCallbacks.splice(cbi,1);
  }
};
unRegisterUserProductionCallback.params=['cb'];


function init(){
  this.self.fingerprint = RandomBytes(12).toString('hex');
  this.self.userProductionCallbacks = [];
  this.self.userMap = {};
  var counter = new BigCounter();
  this.self.newSession = function(){
    counter.inc();
    return RandomBytes(12).toString('hex')+'.'+counter.toString();
  };
};

module.exports = {
  errors:errors,
  init:init,
  _produceUser:_produceUser,
  _findUser:_findUser,
  dumpData: dumpData,
  executeOnUser: executeOnUser,
  produceAndExecute: produceAndExecute,
  registerUserProductionCallback:registerUserProductionCallback
};


function ConsumerSession(u,session){
  this.user = u;
  this.session = session;
  this.queue = [];
  this.lastAccess = Timeout.now();
  var t = this;
  u.describe(function(item){
    t.say(item);
  });
};
ConsumerSession.initTxn = JSON.stringify([JSON.stringify([]),JSON.stringify([null,'init'])]);
ConsumerSession.prototype.destroy = function(){
  for(var i in this){
    delete this[i];
  }
};
ConsumerSession.prototype.retrieveQueue = function(){
  this.lastAccess = Timeout.now();
  if(this.queue && this.queue.length){
    //console.log(this.session,'splicing',this.queue.length);
    return this.queue.splice(0);
  }else{
    //console.log('empty q');
    return [];
  }
};
ConsumerSession.prototype.setSocketIO = function(sock){
  //console.log('setSocketIO, queue len',this.queue.length);
  this.sockio = sock;
  var t = this;
  sock.on('disconnect',function(){
    delete t.sockio;
  });
  while(this.queue.length){
    //console.log('dumping q',this.queue);
    sock.emit('_',this.queue.shift());
  }
};
ConsumerSession.prototype.say = function(item){
  var n = Timeout.now();
  if(this.sockio){
    //console.log('emitting',item);
    this.lastAccess = n;
    this.sockio.emit('_',item);
  }else{
    if(n-this.lastAccess>10000){
      this.destroy();
      return false;
    }
    if(!this.queue){
      return false;
    }
    this.queue.push(item);
    //console.log(this.user.username,this.session,'queue len',this.queue.length);
  }
  return true;
};
