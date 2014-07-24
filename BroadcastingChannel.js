function BroadcastingChannel(sayer){
  if(!sayer){
    return;
  }
  var ss = sayer.say;
  this.subscription = -1;
  this.bcaster = null;
  this.translatorname = '';
  this.say = function(){ss.apply(sayer,arguments);};
  /*
  console.trace();
  console.log('new BroadcastingChannel');
  */
};
BroadcastingChannel.prototype.destroy = function(){
  this.deactivate();
  for(var i in this){
    this[i] = null;
  }
};
BroadcastingChannel.prototype.activate = function(){
  if(this.subscription>=0){return;}
  if(!this.bcaster){return;}
  this.subscription = this.bcaster.attach(this.say,this.translatorname);
};
BroadcastingChannel.prototype.deactivate = function(){
  if(this.subscription<0){return;}
  if(!this.bcaster){return;}
  if(!this.bcaster.destroy){
    console.log('bcaster does not exist any more',this.bcaster);
    this.subscription = -1;
    this.bcaster = null;
    this.translatorname = '';
    return;
  }
  this.bcaster.detach(this.subscription,this.translatorname);
  this.subscription = -1;
};
BroadcastingChannel.prototype.switchTo = function(broadcaster,translatorname){
  if(broadcaster&&this.bcaster&&broadcaster===this.bcaster){
    return;
  }
  this.deactivate();
  if(typeof broadcaster === 'object'){
    this.bcaster = broadcaster;
    this.translatorname = translatorname;
  }else{
    this.bcaster = null;
    this.translatorname = '';
  }
};
BroadcastingChannel.prototype.describe = function(cb){
  if(this.bcaster){
    this.bcaster.describe(cb,this.translatorname);
  }
};
BroadcastingChannel.prototype.active = function(){
  return this.subscription >= 0;
};

module.exports = BroadcastingChannel;
