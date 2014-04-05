var Timeout = require('herstimeout');
var DataUser = require('./DataUser');

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

function SessionUser(data,username,realmname,roles){
  sessions = {};
  var t = this;
  DataUser.call(this,data,function(){},function(item){
    console.log('<=',item);
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

module.exports = SessionUser;
