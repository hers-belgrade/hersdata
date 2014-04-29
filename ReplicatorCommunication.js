var Timeout = require('herstimeout'),
  BigCounter = require('./BigCounter'),
  Listener = require('./listener'),
  DataUser = require('./DataUser'),
  SuperUser = require('./SuperUser');

var __start = Timeout.now();
var __id = 0;

function userStatus(replicatorcommunication){
  var rc = replicatorcommunication;
  return function(item){
    rc.send('userstatus',this.fullname(),item);
  }
}

function userSayer(replicatorcommunication,sendcode){
  var rc = replicatorcommunication;
  var sc = sendcode || 'usersay';
  return function(item){
    Timeout.next(function(sc,rc,item,t){
      //console.log('userSayer',t._replicationid,item);
      rc.send(sc,t._replicationid,item);
    },sc,rc,item,this);
  }
}

var _instanceCount = new BigCounter();

function ReplicatorCommunication(data){
  _instanceCount.inc();
  this._id = _instanceCount.toString();
  Listener.call(this);
  if(!data){return;}
  __id++;
  this.counter = new BigCounter();
  this.cbs = {};
  this.sayers = {};
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
ReplicatorCommunication.prototype.addToSenders = function(user,replicationid,pathtome){
  if(!user.replicators){
    user.replicators = {};
  }
  if(!user.replicators[this._id]){
    user.replicators[this._id] = replicationid;
    this.sayers[replicationid] = (function(u,p){
      var _u = u, _p = p;
      return function(item){if(!_u.say){
        console.log(_u,'has no say');
        return;
      }_u.say.call(_u,[_p.concat(item[0]),item[1]]);};
    })(user,pathtome||[]);
    user.destroyed.attach((function(ss,replicationid){
      var _ss = ss, _cnt = replicationid; 
      return function(){
        console.log(user.fullname,'destroyed');
        delete _ss[_cnt];
      };
    })(this.sayers,replicationid));
  }
};
ReplicatorCommunication.prototype.usersend = function(user,pathtome,remotepath,code){
  if(!(user.username()&&user.realmname())){
    console.trace();
    console.log('user no good',user);
    process.exit(0);
  }
  if(typeof pathtome !== 'object'){
    console.trace();
    console.log('pathtome is missing');
    process.exit(0);
  }
  this.counter.inc();
  var cnt = this.counter.toString();
  this.addToSenders(user,cnt,pathtome);
  if(!user.replicators[this._id]){
    console.trace();
    console.log('no replicationid on the sending side');
    process.exit(0);
  }
  var sendobj = {counter:cnt,user:{_id:user.replicators[this._id],username:user.username(),realmname:user.realmname(),remotepath:remotepath}};
  if(!(this.users && this.users[user.fullname()])){
    sendobj.user.roles = user.roles();
  }
  sendobj[code] = this.prepareCallParams(Array.prototype.slice.call(arguments,4),false,code);
  //console.log('sending',sendobj);
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
        console.log('discarding',cbref);
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
          console.log('discarding',i);
          delete this.cbs[cbrefs[i]];
          if(this.persist){
            delete this.persist[cbrefs[i]];
          }
        }
      }
    }/*else{
      console.log('no cb to invoke for',cbref,commandresult);
    }*/
  }
};
ReplicatorCommunication.prototype.parseAndSubstitute= function(params){
  //console.log('should parse and subst',params);
  var ret = '';
  for(var i in params){
    var p = params[i];
    if(typeof p === 'string'){
      if(p.indexOf('#FunctionRef:')===0){
        var fnref = p.slice(13);
        //console.log('#FunctionRef',fnref);
        if(ret){
          ret += ',';
        }
        ret += fnref;
        params[i] = (function(_t,fr){
          var t = _t, fnref = fr;
          return function(){
            var args = Array.prototype.slice.call(arguments);
            args.unshift(fnref);
            //console.log('sending commandresult',args);
            args.unshift('commandresult');
            t.send.apply(t,args);
          };
        })(this,fnref);
      }
    }
  }
  return ret;
};
ReplicatorCommunication.prototype.createSuperUser = function(token,slaveside){
  if(!this.users){
    this.users = {};
  }
  var sayer;
  if(slaveside){
    sayer = userSayer(this,'slavesay');
  }else{
    sayer = this.userSayer;
  }
  var u =  new SuperUser(this.data,this.userStatus,sayer,token.name,token.realmname);
  u._replicationid = '0.0.0.0';
  u.replicators = {};
  this.users[u.fullname()] = u;
  this.addToSenders(u,'0.0.0.0');
  return u;
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
  if(input.userstatus) {
    var us = input.userstatus;

    if(this.statii){
      var s = this.statii[us[0]];
      if(s){
        s(us[1]);
      }else{
        console.log('no status for',us[0],'to userstatus',us[1]);
      }
    }
    return;
  }
  if(input.usersay){
    var us = input.usersay;
    if(this.sayers){
      var s = this.sayers[us[0]];
      if(s){
        s(us[1]);
      }else{
        console.log('no sayer for',us[0],'to usersay',us[1], input);
      }
    }
    return;
  }
  if(input.user){
    var username = input.user.username, realmname = input.user.realmname, fullname = username+'@'+realmname, u;
    if (!this.users) this.users = {};

    if(!this.users[fullname]){
      var ut, uc;
      if(this.replicaToken.name+'@'+this.replicaToken.realmname===fullname){
        console.trace();
        console.log('superuser cannot be automatically created');
        process.exit(0);
      }
      u =  new DataUser(this.data,this.userStatus,this.userSayer,username,realmname,input.user.roles);
      u._replicationid = input.user._id;
      this.users[fullname] = u;
    }else{
      u = this.users[fullname];
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
    //console.log('on remotepath',input.user.remotepath);
    delete input.user;
    for(var i in input){
      var method = u[i];
      if(method){
        //console.log(u.username(),'applies',i,input[i]);
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

ReplicatorCommunication.prototype.purge = function () {
  var old_cbs = this.cbs;
  this.cbs = {};
  for (var i in old_cbs) {
    try{
    old_cbs[i].call(null, 'DISCARD_THIS');
    }
    catch(e){
      console.log(e.stack);
      console.log(old_cbs[i].toString());
    }
  }
  console.log('discard this sent ....');
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
