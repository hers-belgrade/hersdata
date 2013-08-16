var util = require('util');

function User(name,roles){
  this.name = name;
  this.roles = roles;
};
User.prototype.setDataHive = function(datahive){
  this.datahive = datahive;
  var t = this;
  function parseresp(resp){
    if(util.isArray(resp) && resp.length===2){
      var sess = resp[0];
      for(var i in sess){
        t.sessname = i;
        t.sessdata = sess[i];
      }
      console.log('data primitives',resp[1]);
    }
    setTimeout(ask,0);
  };
  function ask(){
    console.log('asking');
    t.run('',parseresp);
  };
  ask();
};
User.prototype.run = function(functionname,paramobj){
  if(!this.name){
    throw "I've got no name";
  }
  if(!this.datahive){
    throw "I've got no datahive";
  }
  var credentials;
  if(this.sessname){
    credentials = {};
    credentials[this.sessname] = this.sessdata;
  }else{
    credentials = {name:this.name,roles:this.roles};
  }
  console.log('running',functionname,'with',paramobj,'as',credentials);
  this.datahive.interact(credentials,functionname,paramobj);
};

module.exports = User;
