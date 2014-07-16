var RandomBytes = require('crypto').randomBytes;
var BigCounter = require('./BigCounter');
var util = require('util');
var SessionUser = require('./SessionUser');

var errors = {
  'OK':{message:'OK'},
  'NO_NAME':{message:'No name was specified in the request'},
  'NO_SESSION':{message:'Session [session] does not exist',params:['session']},
  'NO_USER':{message:'No username was defined in request'},
  'NO_COMMANDS':{message:'No commands to execute'},
  'NO_ADDRESS':{message:'No remote address given'},
  'NO_SESSIONS_ALLOWED':{message:'No sessions allowed from [address]',params:['address']},
  'TOO_MANY_SESSIONS':{message:'Too many session'}
};

function _findUser(username){
  return this.self.userMap[username];
}

function _produceUser(paramobj,cb,nextcb){
  if(!paramobj.name){
    cb('NO_NAME');
    return;
  }
  if(typeof cb === 'object'){
    console.trace();
    console.log('paramobj is an array');
    process.exit(0);
  }
  var params = Array.prototype.slice.call(arguments,3);
  params.unshift(cb);
  params.unshift(paramobj);
  var u = this.self._findUser(paramobj.name);
  if(u){
    params.unshift(u);
    nextcb.apply(this,params);
    return;
  }
  if(this.self.userFactory){
    var map = this.self.userMap;
    var t = this;
    this.self.userFactory._produceUser(this.data,paramobj.name,this.self.realmName,paramobj.roles,function(user){
      if(user){
        map[user.username()] = user;
      }
      user.destroyed.attach((function(m,u){
        return function(){
          delete m[u.username()];
        };
      })(map,user));
      params.unshift(user);
      nextcb.apply(t,params);
    });
  }else{
    var u = new SessionUser(this.data,paramobj.name,this.self.realmName,paramobj.roles);
    this.self.userMap[u.username()] = u;
    u.destroyed.attach((function(m,u){
      return function(){
        delete m[u.username()];
      };
    })(map,u));
    params.unshift(u);
    nextcb.apply(this,params);
  }
}

function _produceSession(user,paramobj,scb,nextcb){
  if(!user){
    scb('NO_USER');
    return;
  }
  var sessid = paramobj[this.self.fingerprint];
  if(!sessid){
    sessid = user.sessionForAddress(paramobj.address);
    //console.log('session for address',paramobj.address,'is',sessid);
    if(sessid === null){
      scb('NO_SESSIONS_ALLOWED',paramobj.address);
      return;
    }
    if(!sessid){
      sessid=this.self.newSessionId();
      console.log('created',sessid,'on',user.username(),'with',user.sessioncount,'because',this.self.fingerprint,'was not found in',paramobj);
    }
  }
  //console.log(user.sessions);
  var params = Array.prototype.slice.call(arguments,4);
  params.unshift(scb);
  params.unshift(paramobj);
  params.unshift(user);
  user.makeSession(sessid,paramobj.address);
  params.unshift(sessid);
  nextcb.apply(this,params);
};

function userDumper(sessid,user,paramobj,scb){
  var session = {};
  session[this.self.fingerprint]=sessid;
  scb('OK', {
    username:user.username(),
    realmname:user.realmname(),
    roles:paramobj.roles,
    session:session,
    data:user.sessions[sessid] ? user.sessions[sessid].retrieveQueue() : []
  });
}

function dumpData(paramobj,statuscb) {
  //var user = _produceUser.call(this,paramobj,userDumper(this.self,paramobj,statuscb));
  _produceUser.call(this,paramobj,statuscb,_produceSession,userDumper);
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
      //console.trace();
      console.log('no method named',command,'on user',params);
      cb('NO_FUNCTIONALITY',method);
    }else{
      //console.log('applying',command,'to',user.username,Array.prototype.slice.call(arguments,2));
      method.apply(user,Array.prototype.slice.call(arguments,2));
    }
    return;
  }
  user.invoke(command,params,cb); //this is data
}

function userExecutor(session,user,paramobj,statuscb){
  if(!user.destroyed){return;} //ded already
  var commands = paramobj.dontparse ? paramobj.commands : JSON.parse(paramobj.commands);
  var sessionobj = {};
  sessionobj[this.self.fingerprint]=session;
  var ret = {username:user.username(),realmnname:user.realmname(),roles:user.roles(),session:sessionobj};
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
        //console.log(cmdsdone,'cmds done out of',cmdstodo);
        if(cmdsdone===cmdstodo){
          var s = user.sessions[session];
          if(!s){
            //console.log('NO_SESSION',session,user.sessions);
            _scb('NO_SESSION',session);
            return;
          }
          var so = {};
          so[fp] = session;
          if(!s.sockio){
            ret.data=s ? s.retrieveQueue() : [];
          }
          _scb('OK',ret);
        }
      };
    })(i));
  }
};

function executeOnUser(user,session,commands,cb){
  userExecutor.call(this,session,user,{commands:commands,dontparse:true},cb);
};
executeOnUser.params=['user','session','commands'];

function produceAndExecute(paramobj,statuscb){
  var commands = paramobj.commands;
  if(!commands){
    statuscb('NO_COMMANDS');
    return;
  }
  _produceUser.call(this,paramobj,statuscb,_produceSession,userExecutor);
  return;
  var self = this.self;
  _produceUser.call(this,paramobj,function(user){
    //console.log('recognized',user.username(),user.realmname(),user.keys);
    if(!user){
      statuscb('NO_USER');
      return;
    }
    self.executeOnUser({user:user,session:session,commands:commands},function(ecb,ep,em){
      statuscb(ecb,ep[0],em);
    });
  });
};
produceAndExecute.params='originalobj';


function init(){
  if(this.self.userFactory && typeof this.self.userFactory._produceUser !== 'function'){
    console.trace();
    console.log('userFactory has to have a method named _produceUser, will process.exit now');
    process.exit(0);
  }
  this.self.fingerprint = RandomBytes(12).toString('hex');
  console.log('sessionuserfunctionality started',this.self.fingerprint);
  this.self.userMap = {};
  var counter = new BigCounter();
  this.self.newSessionId = function(){
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
  produceAndExecute: produceAndExecute
};
