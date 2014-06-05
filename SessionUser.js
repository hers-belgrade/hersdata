var Timeout = require('herstimeout');
var DataUser = require('./DataUser');

var maxsessionsperaddress = 10,
  maxsessionstotal = 50,
  nosessionsgraceperiod = 3000;

function ConsumerSession(u,session,address){
  this.user = u;
  this.session = session;
  this.address = address;
  this.queue = [];
  this.lastAccess = Timeout.now();
  var t = this;
  u.describe(function(item){
    t.say(item);
  });
};
ConsumerSession.initTxn = JSON.stringify([JSON.stringify([]),JSON.stringify([null,'init'])]);
ConsumerSession.prototype.destroy = function(){
  if(!this.user){return;}
  this.user.sessionDown(this);
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
    //t.destroy();
  });
  if(this.queue){
    while(this.queue.length){
      //console.log('dumping q',this.queue);
      sock.emit('_',this.queue.shift());
    }
  }
};
ConsumerSession.prototype.say = function(item){
  if(!this.session){return;}
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
    //console.log(this.user.username(),this.session,'queue len',this.queue.length);
  }
  return true;
};

function SessionUser(data,username,realmname,roles){
  sessions = {};
  this.sessioncount=0;
  var t = this;
  DataUser.call(this,data,function(){},function(item){
    //console.log(t.username,'<=',item);
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
  this.sessionsperaddress = {};
}
SessionUser.prototype = Object.create(DataUser.prototype,{constructor:{
  value:SessionUser,
  enumerable:false,
  writable:true,
  configurable:true
}});
SessionUser.prototype.sessionForAddress = function(address){
  if(address&&!(this.sessionsperaddress&&this.sessionsperaddress[address]>maxsessionsperaddress)){
    return; //may be new one
  }
  for(var i in this.sessions){
    var s = this.sessions[i];
    if(s.address===address && !s.sockio){
      return i;
    }
  }
  //console.log('sessionsperaddress',this.sessionsperaddress,'=>',ret);
  return null;
};
SessionUser.prototype.makeSession = function(sess,address){
  if(this.sessionsperaddress && this.sessionsperaddress[address]>maxsessionsperaddress){
    return;
  }
  if(!sess){
    console.trace();
    console.log('no session to make');
    process.exit(0);
  }
  if(this.sessions[sess]){return;}
  if(this.sessioncount>maxsessionstotal){return;}
  this.sessions[sess] = new ConsumerSession(this,sess,address);
  this.sessioncount++;
  if(!this.sessionsperaddress[address]){
    this.sessionsperaddress[address]=1;
  }else{
    this.sessionsperaddress[address]++;
  }
  if(this.dieTimeout){
    Timeout.clear(this.dieTimeout);
    delete this.dieTimeout;
  }
};
SessionUser.prototype.sessionDown = function(sess){
  delete this.sessions[sess.session];
  this.sessioncount--;
  this.sessionsperaddress[sess.address]--;
  console.log(this.username(),'session',sess.session,'down',this.sessioncount,'left');
  if(this.sessioncount<1){
    if(this.dieTimeout){
      Timeout.clear(this.dieTimeout);
    }
    this.dieTimeout = Timeout.set(this,nosessionsgraceperiod,'destroy');
  }
};
SessionUser.prototype.destroy = function(){
  console.log(this.username(),'destroying');
  if(this.sessioncount){
    console.log('not yet, there are still',this.sessioncount,'connected');
    return;
  }
  console.log('really');
  DataUser.prototype.destroy.call(this);
};

module.exports = SessionUser;
