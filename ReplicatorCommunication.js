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
    rc.send('userstatus',this.fullname(),item);
  }
}

function userSayer(replicatorcommunication,sendcode){
  var rc = replicatorcommunication;
  var sc = sendcode || 'usersay';
  return function(item){
    /*
    if(this._replicationid==='0.0.0.0'){
      console.trace();
      console.log('<=',sc,this._replicationid,item);
    }
      */
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
        //console.log(_u,'has no say');
        return;
      }_u.say.call(_u,[_p.concat(item[0]),item[1]]);};
    })(user,pathtome||[]);
    user.destroyed.attach((function(t,replicationid){
      var _t = t, _cnt = replicationid; 
      return function(){
        //console.trace();
        //console.log(user.fullname(),'destroyed on',_cnt);
        _t.sendobj({destroy:_cnt});
        delete _t.sayers[_cnt];
      };
    })(this,replicationid));
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
  var sendobj = {counter:cnt,user:{_id:user.replicators[this._id],username:user.username(),realmname:user.realmname(),remotepath:remotepath?JSON.parse(JSON.stringify(remotepath)):remotepath}};
  if(!(this.users && this.users[user.fullname()])){
    sendobj.user.roles = user.roles();
  }
  sendobj[code] = this.prepareCallParams(Array.prototype.slice.call(arguments,4),false,code);
  Timeout.next(function(t,so){t.sendobj(so);},this,sendobj);
  var t = this;
  return {
    destroy:function(){
      delete t.cbs[cnt];
      delete t.persist[cnt];
      t.sendobj({destroy:cnt});
    }
  }
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
    }else{
      console.log('no cb to invoke for',cbref,commandresult);
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
  this.users[u.fullname()] = u;
  this._fullname = u.fullname();
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
  if(input.destroy){
    var di = input.destroy;
    var d = this.destroyables[di];
    if(d){
      //console.log('destroying',di);
      d.destroy();
      //delete this.destroyables[di];
    }else{
      console.log('no destroyable on',di);
    }
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
  if(input.mastersay){
    this.masterSays.fire(input.mastersay[1]);
  }
  if(input.slavesay){
    this.slaveSays.fire(input.slavesay[1]);
  }
  if(input.usersay){
    var us = input.usersay;
    if(this.sayers){
      var s = this.sayers[us[0]];
      if(s){
        s(us[1]);
      }else{
        console.log('no sayer for',us[0],'to usersay',us[1], input);
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
      u._replicationid = input.user._id;
      this.users[fullname] = u;
    }else{
      u = this.users[fullname];
    }
    var remotepath = input.user.remotepath;
    if(remotepath){
      if(typeof remotepath[0] === 'object'){
        /*
        //console.log('going for',remotepath);
        function fp(rp,u,t,counter,cbrefs,input){
          //console.log('going for',remotepath);
          u.follow(rp.shift(), function(stts){
              if(stts==='OK'){
                if(rp.length){
                  Timeout.next(function(rp,u,t,counter,cbrefs,input){
                    fp(rp,u,t,counter,cbrefs,input);
                  },rp,this,t,counter,cbrefs,input);
                }else{
                  delete input.user;
                  for(var i in input){
                    var method = this[i];
                    if(method){
                      //console.log(this.username(),'applies',i);//,input[i]);
                      t.handleDestroyable(counter,cbrefs,method.apply(this,input[i]));
                    }
                  }
                }
              }
            }
          );
        };
        fp(remotepath,u,this,counter,cbrefs,input);
        return;
        */
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
