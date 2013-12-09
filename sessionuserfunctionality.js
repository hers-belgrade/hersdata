var RandomBytes = require('crypto').randomBytes;
var KeyRing = require('./keyring');
var Follower = require('./follower');
var BigCounter = require('./BigCounter');
var util = require('util');
var SessionUser = require('SessionUser');

var errors = {
  'OK':{message:'OK'},
  'NO_SESSION':{message:'Session [session] does not exist',params:['session']}
};

function findUser(params,statuscb){
  var fp = this.self.fingerprint;
  var session = params[fp];
  if(session){
    var user = this.self.sessions[session];
    if(user){
      return statuscb('OK',user,session);
    }else{
      delete params[fp];
    }
  }
  var name = params.name;
  var t = this,scb = statuscb;
  //console.log('roles',params.roles);
  this.cbs.checkUserName(name,params.roles,function(roles){
    if(roles===null){
      //anonymous?
      console.log('anonymous?');
      scb('OK');
    }
    var _scb = scb;
    t.data.setUser(name,t.self.realmname,roles,function(user){
      var session = t.self.newSession();
      t.self.sessions[session] = user;
      user.roles=roles;
      user.makeSession(session);
      _scb('OK',user,session);
    });
  });
};
findUser.params = 'originalobj';

function deleteUserSession(user,session,statuscb){
  var s = user.sessions[session];
  if(s){
    s.dumpQueue();
  }else{
    //console.log('no session',session);
  }
};
deleteUserSession.params=['user','session'];

function dumpUserSession(user,session,statuscb,justpeek){
  var s = user.sessions[session];
  if(!s){
    return statuscb('NO_SESSION',session);
  }
  var so = {};
  so[this.self.fingerprint] = session;
  user.sessions[session].dumpQueue(function(data){
    statuscb('OK',[so,data]);
  },justpeek);
};
dumpUserSession.params=['user','session'];

function invokeOnUserSession(user,session,path,paramobj,cb,statuscb){
  //console.log('invoking',path,paramobj,cb);
  user.invoke(path,paramobj,cb);
};
invokeOnUserSession.params=['user','session','path','paramobj','cb'];


function init(){
  this.self.sessions = {};
  this.self.fingerprint = RandomBytes(12).toString('hex');
  var counter = new BigCounter();
  this.self.newSession = function(){
    counter.inc();
    return RandomBytes(12).toString('hex')+'.'+counter.toString();
  };
  this.data.userFactory = {create:function(data,username,realmname){
    return new SessionUser(data,username,realmname);
  }};
};

module.exports = {
  errors:errors,
  init:init,
  findUser:findUser,
  dumpUserSession:dumpUserSession,
  deleteUserSession:deleteUserSession,
  invokeOnUserSession:invokeOnUserSession,
  requirements:{
    checkUserName:function(username,roles,cb){
      cb(roles);
    }
  }
};
