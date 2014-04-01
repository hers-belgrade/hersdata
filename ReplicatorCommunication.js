var Timeout = require('herstimeout'),
  BigCounter = require('./BigCounter'),
  Listener = require('./listener'),
  DataUser = require('./DataUser'),
  UserBase = require('./userbase');

var __start = Timeout.now();
var __id = 0;

function userStatus(replicatorcommunication){
  var rc = replicatorcommunication;
  return function(item){
    rc.send('userstatus',this.fullname,item);
  }
}

function userSayer(replicatorcommunication){
  var rc = replicatorcommunication;
  return function(item){
    rc.send('usersay',this.fullname,item);
  }
}

function ReplicatorCommunication(data){
  Listener.call(this);
  if(!data){return;}
  __id++;
  this.counter = new BigCounter();
  this.cbs = {};
  this.__id = __id;
  this.data = data;
  this.userStatus = userStatus(this);
  this.userSayer = userSayer(this);
}
for(var i in Listener.prototype){
  ReplicatorCommunication.prototype[i] = Listener.prototype[i];
}
ReplicatorCommunication.prototype.destroy = function(){
  if (this.destroyables) {
    for (var i in this.destroyables) {
      this.destroyables[i] && this.destroyables[i].destroy();
    }
  }
  Listener.prototype.destroy.call(this);
  for(var i in rc){
    delete rc[i];
  }
};
ReplicatorCommunication.prototype.send = function(code){
  this.counter.inc();
  var cnt = this.counter.toString();
  var sendobj = {counter:cnt};
  sendobj[code] = this.prepareCallParams(Array.prototype.slice.call(arguments,1),false,code);
  this.sendobj(sendobj);
};
ReplicatorCommunication.prototype.usersend = function(user,code){
  if(!(user.username&&user.realmname)){
    console.trace();
    console.log('user no good',user);
    process.exit(0);
  }
  this.counter.inc();
  var cnt = this.counter.toString();
  var sendobj = {counter:cnt,user:{username:user.username,realmname:user.realmname,remotepath:user.remotepath}};
  if(!(this.data.users && this.data.users[user.fullname])){
    sendobj.user.roles = user.roles;
    /*
    console.log(this.data.users,user.fullname);
    var args = arguments;
    var t = this;
    */
    this.data.plantUser(function(errc){
      //Timeout.next(function(t,args){t.usersend.apply(t,args);},t,args);
    },user);
  }
  sendobj[code] = this.prepareCallParams(Array.prototype.slice.call(arguments,2),false,code);
  this.sendobj(sendobj);
};
ReplicatorCommunication.prototype.prepareCallParams = function(ca,persist){
  if(ca[ca.length-1]==='__persistmycb'){
    ca.pop();
    return this.prepareCallParams(ca,true);
  }
  for(var i in ca){
    cb = ca[i];
    var tocb = typeof cb;
    if(tocb === 'function'){
      this.counter.inc();
      var cts = this.counter.toString();
      var cs = '#FunctionRef:'+cts;
      this.cbs[cts] = cb;
      if(persist){
        if(!this.persist){
          this.persist = {};
        }
        this.persist[cts] = 1;
      }
      ca[i] = cs;
    }
  }
  return ca;
};
ReplicatorCommunication.prototype.execute = function(commandresult){
  if(commandresult.length){
    cbref = commandresult.splice(0,1)[0];
    var cb = this.cbs[cbref];
    //console.log('cb for',cbref,'is',cb);
    if(typeof cb === 'function'){
      cb.apply(null,commandresult);
      if(!(this.persist && this.persist[cbref])){
        delete this.cbs[cbref];
      }
      if(commandresult==='DISCARD_THIS'){
        delete this.cbs[cbref];
        if(this.persist){
          delete this.persist[cbref];
        }
      }
      if(commandresult==='DISCARD_GROUP'){
        var cbrefs = arguments[1];
        if(!cbrefs){return;}
        cbrefs = cbrefs.split(',');
        for(var i in cbrefs){
          delete this.cbs[cbrefs[i]];
          if(this.persist){
            delete this.persist[cbrefs[i]];
          }
        }
      }
    }
  }
};
ReplicatorCommunication.prototype.parseAndSubstitute= function(params){
  //console.log('should parse and subst',params);
  var ret = '';
  for(var i in params){
    var p = params[i];
    if(typeof p === 'string'){
      if(p.indexOf('#FunctionRef:')===0){
        var fnref = p.slice(13),t = this;
        //console.log('#FunctionRef',fnref);
        if(ret){
          ret += ',';
        }
        ret += fnref;
        params[i] = function(){
          var args = Array.prototype.slice.call(arguments);
          args.unshift(fnref);
          //console.log('sending commandresult',args);
          args.unshift('commandresult');
          t.send.apply(t,args);
        };
      }
    }
  }
  return ret;
};
ReplicatorCommunication.prototype.handOver = function(input){
  var counter = input.counter;
  var cbrefs = '';
  delete input.counter;
  for(var i in input){
    var _cbrefs = this.parseAndSubstitute(input[i]);
    if(_cbrefs){
      if(cbrefs){
        cbrefs += ',';
      }
      cbrefs += _cbrefs;
    }
  }
  var commandresult = input.commandresult;
  if(commandresult){
    delete input.commandresult;
    this.execute(commandresult);
  }
  if(input.user){
    var username = input.user.username, realmname = input.user.realmname, fullname = username+'@'+realmname, u;
    if(!(this.data.users && this.data.users[fullname])){
      u = new DataUser(this.data,this.userStatus,this.userSayer,username,realmname,input.user.roles); 
      if(!this.data.users){
        this.data.users = {};
      }
      this.data.users[fullname] = u;
    }else{
      u = this.data.users[fullname];
    }
    var remotepath = input.user.remotepath;
    if(remotepath){
      if(typeof remotepath[0] === 'object'){
        while(remotepath[0]){
          u = u.follow(remotepath[0]);
          remotepath.shift();
        }
      }else{
        u = u.follow(remotepath);
      }
    }
    delete input.user;
    for(var i in input){
      var method = u[i];
      if(method){
        method.apply(u,input[i]);
      }
    }
    return;
  }
  var ret = this.data.processInput(this,input);
  if (ret && ('function' === typeof(ret.destroy))) {
    if (!this.destroyables) this.destroyables = {};
    this.destroyables[counter] = ret;
    if(ret.destroyed){
      this.createListener(counter+'destroyed',function(){
        this.destroyListener(counter+'destroyed');
        delete this.destroyables[counter];
        if(cbrefs){
          this.send('commandresult','DISCARD_GROUP',cbrefs);
        }
      },ret.destroyed);
    }
  }
};

ReplicatorCommunication.prototype.doUserFollow = function(username,realmname){
  //console.log('doUserFollow',username,realmname,Array.prototype.slice.call(arguments,2));
  var u = UserBase.findUser(username,realmname);
  if(u){
    if(!u.follow){
      return;
    }
    u.follow(Array.prototype.slice.call(arguments,2,-1),arguments[arguments.length-1]);
  }
};


ReplicatorCommunication.metrics = function(){
  var _n = Timeout.now(), elaps = _n-__start,
    st=ReplicatorCommunication.sendingTime,rt=ReplicatorCommunication.rcvingTime,et=ReplicatorCommunication.execTime,
    rb=ReplicatorCommunication.rcvBytes,sb=ReplicatorCommunication.sentBytes;
  __start = _n;
  ReplicatorCommunication.sendingTime=0;
  ReplicatorCommunication.rcvingTime=0;
  ReplicatorCommunication.execTime=0;
  ReplicatorCommunication.rcvBytes=0;
  ReplicatorCommunication.sentBytes=0;
  return {buffer:{rx:ReplicatorCommunication.input,tx:ReplicatorCommunication.output},utilization:{rx:~~(rt*100/elaps),tx:~~(st*100/elaps),exec:~~(et*100/elaps)},traffic:{tx:sb,rx:rb}};
};
ReplicatorCommunication.input = 0;
ReplicatorCommunication.output = 0;
ReplicatorCommunication.rcvingTime = 0;
ReplicatorCommunication.sendingTime = 0;
ReplicatorCommunication.execTime = 0;
ReplicatorCommunication.rcvBytes = 0;
ReplicatorCommunication.sentBytes = 0;

module.exports = ReplicatorCommunication;
