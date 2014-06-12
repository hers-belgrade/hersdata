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
BroadcastingChannel.prototype.destroy = function(){
  this.deactivate();
  for(var i in this){
    delete this[i];
  }
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
  if(typeof broadcaster === 'object'){
    this.bcaster = broadcaster;
    this.translatorname = translatorname;
  }else{
    delete this.bcaster;
    delete this.translatorname;
  }
};
BroadcastingChannel.prototype.describe = function(cb){
  if(this.bcaster){
    this.bcaster.describe(cb,this.translatorname);
  }
};
BroadcastingChannel.prototype.active = function(){
  return !!this.subscription;
};

module.exports = BroadcastingChannel;
