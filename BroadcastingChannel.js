function BroadcastingChannel(sayer){
  if(!sayer){
    return;
  }
  var ss = sayer.say;
  this.say = function(){ss.apply(sayer,arguments);};
  /*
  console.trace();
  console.log('new BroadcastingChannel');
  */
};
BroadcastingChannel.prototype.activate = function(){
  if(this.subscription){return;}
  if(!this.bcaster){return;}
  this.subscription = this.bcaster.attach(this.say,this.translatorname);
};
BroadcastingChannel.prototype.deactivate = function(){
  if(!this.subscription){return;}
  if(!this.bcaster){return;}
  this.bcaster.detach(this.subscription,this.translatorname);
  delete this.subscription;
};
BroadcastingChannel.prototype.switchTo = function(broadcaster,translatorname){
  if(broadcaster&&this.bcaster&&broadcaster===this.bcaster){
    return;
  }
  this.deactivate();
  this.bcaster = broadcaster;
  this.translatorname = translatorname;
};
BroadcastingChannel.prototype.describe = function(cb){
  if(this.bcaster){
    this.bcaster.describe(cb,this.translatorname);
  }
};

module.exports = BroadcastingChannel;
