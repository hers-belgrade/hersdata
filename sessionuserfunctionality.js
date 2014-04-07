var RandomBytes = require('crypto').randomBytes;
var BigCounter = require('./BigCounter');
var util = require('util');
var SessionUser = require('./SessionUser');

var errors = {
  'OK':{message:'OK'},
  'NO_SESSION':{message:'Session [session] does not exist',params:['session']},
  'NO_USER':{message:'No username was defined in request'},
  'NO_COMMANDS':{message:'No commands to execute'}
};

function _findUser(username){
  return this.self.userMap[username];
}

function _produceUser(paramobj,cb){
  if(!paramobj.name){
    cb();
    return;
  }
  var u = this.self._findUser(paramobj.name);
  if(u){
    cb(u);
    return;
  }
  if(this.self.userFactory){
    var map = this.self.userMap;
    this.self.userFactory(this.data,paramobj.name,this.self.realmName,paramobj.roles,function(user){
      if(user){
        map[user.username] = user;
      }
      cb(user);
    });
  }else{
    var ret = new SessionUser(this.data,paramobj.name,this.self.realmName,paramobj.roles);
    this.self.userMap[user.username] = user;
    cb(ret);
  }
}

function userDumper(slf,po,scb){
  var self = slf, paramobj = po, statuscb = scb;
  return function(user){
    if(!user){
      statuscb('NO_USER');
      return;
    }
    var sessid = paramobj[self.fingerprint];
    if(!sessid){
      sessid=self.newSession();
      console.log('created',sessid,'on',user.username,'because',self.fingerprint,'was not found in',paramobj);
    }
    //console.log(user.sessions);
    user.makeSession(sessid);
    var session = {};
    session[self.fingerprint]=sessid;
    statuscb('OK', {
      username:user.username,
      realmname:user.realmname,
      roles:paramobj.roles,
      session:session,
      data:user.sessions[sessid] ? user.sessions[sessid].retrieveQueue() : []
    });
  };
}

function dumpData(paramobj,statuscb) {
  var user = _produceUser.call(this,paramobj,userDumper(this.self,paramobj,statuscb));
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
      console.log('no method named',command,'on user');
      cb('NO_FUNCTIONALITY',method);
    }else{
      console.log('applying',command,'to',user.username,Array.prototype.slice.call(arguments,2));
      method.apply(user,Array.prototype.slice.call(arguments,2));
    }
    return;
  }
  user.invoke(command,params,cb); //this is data
}

function executeOnUser(user,session,commands,statuscb){
  var sessionobj = {};
  sessionobj[this.self.fingerprint]=session;
  var ret = {username:user.username,realmnname:user.realmname,roles:user.roles,session:sessionobj};
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
  var self = this.self;
  _produceUser.call(this,paramobj,function(user){
    //console.log('recognized',user.username,user.realmname,user.keys);
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
  this.self.fingerprint = RandomBytes(12).toString('hex');
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
  produceAndExecute: produceAndExecute
};
