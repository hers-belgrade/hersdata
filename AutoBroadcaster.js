var Broadcaster = require('./Broadcaster'),
  DataFollower = require('./DataFollower');

function autoBroadcasterSay(item){
  if(this.depth && item && item[1] && item[1][1]===null){
    this.follow([item[1][0]],function(stts){
      if(stts==='RETREATING'){
        this.destroy();
      }
    },undefined,AutoBroadcasterChild,this.depth-1);
  }
};

function AutoBroadcasterChild(data,createcb,saycb,user,path,depth){
  this.depth = depth;
  DataFollower.call(this,data,createcb,saycb,user,path);
  this.originalsay = this.say;
  delete this.say;
}
AutoBroadcasterChild.prototype = Object.create(DataFollower.prototype,{constructor:{
  value:AutoBroadcasterChild,
  enumerable:false,
  writable:false,
  configurable:false
}});
AutoBroadcasterChild.prototype.say = function(item){
  autoBroadcasterSay.call(this,item);
  this.originalsay.call(this,item);
};

function AutoBroadcaster(data,createcb,username,realmname,roles,depth){
  this.depth = depth;
  Broadcaster.call(this,data,createcb,username,realmname,roles);
};
AutoBroadcaster.prototype = Object.create(Broadcaster.prototype,{constructor:{
  value:AutoBroadcaster,
  enumerable:false,
  writable:false,
  configurable:false
}});
AutoBroadcaster.prototype.say = function(item){
  autoBroadcasterSay.call(this,item);
  Broadcaster.prototype.say.call(this,item);
};



module.exports = AutoBroadcaster;
