var Timeout = require('herstimeout'),
  BigCounter = require('./BigCounter'),
  DataUser = require('./DataUser'),
  SuperUser = require('./SuperUser'),
  HookCollection = require('./hookcollection');

var __start = Timeout.now();
var __id = 0;

function userStatus(replicatorcommunication){
  var rc = replicatorcommunication;
  return function(item){
    if(!rc.counter){return;} //rc ded
    rc.send('userstatus',this.fullname(),item);
  }
}

function userSayer(replicatorcommunication,sendcode){
  var rc = replicatorcommunication;
  var sc = sendcode || 'usersay';
  return function(item){
    Timeout.next(function(sc,rc,item,t){
      if(!rc.counter){return;} //rc ded
      rc.send(sc,t._replicationid,item);
    },sc,rc,item,this);
  }
}

var _instanceCount = new BigCounter();

function ReplicatorCommunication(data){
  _instanceCount.inc();
  this._id = _instanceCount.toString();
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
ReplicatorCommunication.prototype.destroy = function(){
  if(this.slaveSays){
    this.slaveSays.destruct();
  }
  if(this.masterSays){
    this.masterSays.destruct();
  }
  if(this.data && this.data.communication){
    delete this.data.communication;
  }
  if (this.destroyables) {
    for (var i in this.destroyables) {
      if(this.destroyables[i]){
        this.destroyables[i].destroy();
      }
    }
  }
  for(var i in this.cbs){
    this.cbs[i] = null;
    delete this.cbs[i];
  }
  if(this.users){
    for(var i in this.users){
      this.users[i].destroy();
    }
  }
  for(var i in this){
    delete this[i];
  }
};
ReplicatorCommunication.prototype.send = function(code){
  this.counter.inc();
  var cnt = this.counter.toString();
  var sendobj = {counter:cnt};
  sendobj[code] = this.prepareCallParams(Array.prototype.slice.call(arguments,1),false);
  this.sendobj(sendobj);
};
ReplicatorCommunication.prototype.addToSenders = function(user,replicationid,pathtome){
  if(!user.replicators){
    user.replicators = {};
  }
  if(!user.replicatorcbs){
    user.replicatorcbs = {};
  }
  if(!user.replicators[this._id]){
    if(typeof replicationid === 'undefined'){
      this.counter.inc();
      replicationid = this.counter.toString();
    }
    user.replicators[this._id] = replicationid;
    user.replicatorcbs[this._id] = [];
    this.sayers[replicationid] = (function(u,p){
      var _u = u, _p = p;
      return function(item){if(!_u.say){
        //console.log(_u,'has no say');
        return;
      }_u.say.call(_u,[_p.concat(item[0]),item[1]]);};
    })(user,pathtome||[]);
    //console.log(Object.keys(this.sayers).length,'sayers when',user.fullname(),user.path);
    user.destroyed.attach((function(t,replicationid,user){
      var _t = t, _cnt = replicationid,_u = user; 
      return function(){
        //console.trace();
        //console.log(_u.fullname(),'destroyed on',_cnt);
        var mycbrefs = _u.replicatorcbs[_t._id];
        if(mycbrefs){
          delete _u.replicatorcbs[_t._id];
          for(var i in mycbrefs){
            var mcbr = mycbrefs[i];
            //console.log('clearing cbref',mcbr);
            delete _t.cbs[mcbr];
            delete _t.persist[mcbr];
          }
        }
        _t.sendobj({destroy:_cnt});
        delete _t.sayers[_cnt];
        //console.log(Object.keys(t.sayers).length,'sayers');
      };
    })(this,replicationid,user));
  }
};
ReplicatorCommunication.prototype.usersend = function(user,pathtome,remotepath,code){
  if(!(user.username()&&user.realmname())){
    return;
    console.trace();
    console.log('user no good',user);
    process.exit(0);
  }
  if(typeof pathtome !== 'object'){
    return;
    console.trace();
    console.log('pathtome is missing');
    process.exit(0);
  }
  this.counter.inc();
  this.addToSenders(user,undefined,pathtome);
  var cnt = this.counter.toString();
  if(!user.replicators[this._id]){
    console.trace();
    console.log('no replicationid on the sending side');
    process.exit(0);
  }
  var sendobj = {counter:cnt,user:{_id:user.replicators[this._id],username:user.username(),realmname:user.realmname(),remotepath:remotepath?JSON.parse(JSON.stringify(remotepath)):remotepath}};
  if(!(this.users && this.users[user.fullname()])){
    sendobj.user.roles = user.roles();
  }
  sendobj[code] = this.prepareCallParams(Array.prototype.slice.call(arguments,4),false,user);
  Timeout.next(this,'sendobj',sendobj);
  var t = this;
  return {
    destroy:function(){
      delete t.cbs[cnt];
      delete t.persist[cnt];
      t.sendobj({destroy:cnt});
    }
  }
};
ReplicatorCommunication.prototype.prepareCallParams = function(ca,persist,user){
  if(ca[ca.length-1]==='__persistmycb'){
    ca.pop();
    return this.prepareCallParams(ca,true,user);
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
        user.replicatorcbs[this._id].push(cts);
      }
      ca[i] = cs;
    }
  }
  return ca;
};
ReplicatorCommunication.prototype.execute = function(commandresult){
  if(commandresult.length){
    cbref = commandresult.shift();
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
    this.masterSays = new HookCollection();
    sayer = userSayer(this,'slavesay');
  }else{
    this.slaveSays = new HookCollection();
    sayer = userSayer(this,'mastersay');
  }
  var u =  new SuperUser(this.data,this.userStatus,sayer,token.name,token.realmname);
  u._replicationid = '0.0.0.0';
  u.replicators = {};
  var fullname = u.fullname();
  this.users[fullname] = u;
  u.destroyed.attach((function(_us,_fn){
    var us=_us,fn=_fn
    return function(){
      delete us[fn];
    }
  })(this.users,fullname));
  this._fullname = u.fullname();
  this.addToSenders(u,'0.0.0.0');
  return u;
};
ReplicatorCommunication.prototype.handOver = function(input){
/*
  console.log(
    'users',this.users ? Object.keys(this.users).length : 0,
    'cbs',this.cbs ? Object.keys(this.cbs).length : 0,
    'persist',this.persist ? Object.keys(this.persist).length : 0,
    'destroyables',this.destroyables ? Object.keys(this.destroyables).length : 0,
    'sayers',this.sayers ? Object.keys(this.sayers).length : 0,
    'statii',this.statii ? Object.keys(this.statii).length : 0
  );
  */
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
    return;
  }
  if(input.destroy){
    var di = input.destroy;
    var d = this.destroyables ? this.destroyables[di] : null;
    if(d){
      //console.log('destroying',di);
      d.destroy();
      //delete this.destroyables[di];
    }else{
      console.log('no destroyable on',di);
    }
    return;
  }
  if(input.mastersay){
    this.masterSays.fire(input.mastersay[1]);
    return;
  }
  if(input.slavesay){
    this.slaveSays.fire(input.slavesay[1]);
    return;
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
        //console.log('no sayer for',us[0],'to usersay',us[1], input);
        this.send({destroy:us[0]});
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
      u.user().server = this.replicaToken.name;
      u._replicationid = input.user._id;
      u.destroyed.attach((function(_us,_fn){
        var us=_us,fn=_fn
        return function(){
          delete us[fn];
        }
      })(this.users,fullname));
      this.users[fullname] = u;
    }else{
      u = this.users[fullname];
    }
    var remotepath = input.user.remotepath;
    if(remotepath){
      if(typeof remotepath[0] === 'object'){
        while(remotepath.length){
          u = u.follow(remotepath.shift());
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
        //console.log(u.username(),'applies',i);//,input[i]);
        this.handleDestroyable(counter,cbrefs,method.apply(u,input[i]));
      }
    }
    return;
  }
  this.handleDestroyable(counter,cbrefs,this.data.processInput(this,input));
};

ReplicatorCommunication.prototype.handleDestroyable = function(counter,cbrefs,obj){
  if (obj && ('function' === typeof(obj.destroy))) {
    //console.log('putting destroyable to',counter);
    if (!this.destroyables){
      this.destroyables = {};
      this.destroyablecount = 0;
    }
    this.destroyables[counter] = obj;
    this.destroyablecount++;
    //console.log('desctcnt',this.destroyablecount);
    if(obj.destroyed){
      obj.destroyed.attach((function(t,cnt){
        return function(){
          t.destroyablecount--;
          //console.log('desctcnt',t.destroyablecount);
          //console.log('removing destroyable',cnt);
          delete t.destroyables[cnt];
        }
      })(this,counter));
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
