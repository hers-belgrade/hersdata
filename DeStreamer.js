var Collection = require('./Collection'),
  Scalar = require('./Scalar');
 
function ElementWaiter(parnt,cb,ctx){
  this.parent = parnt;
  this.parentDestroyed = parnt.destroyed.attach(this.destroy);
  this.ctx = ctx;
  this.cb = cb;
};
ElementWaiter.prototype.trigger = function(val){
  var cbr = this.cb.call(this.ctx,val);
  if(typeof cbr !== 'undefined'){
    this.destroy();
  }
};
ElementWaiter.prototype.detach = function(){
  if(this.el && this.changerIndex){
    this.el.changed && this.el.changed.detach(this.changerIndex);
    delete this.el;
    delete this.changerIndex;
  }
}
ElementWaiter.prototype.attachTo = function(el){
  this.detach();
  var t = this;
  if(el.type()==='Scalar'){
    this.el = el;
    //console.log('attaching to Scalar');
    this.changerIndex = el.changed.attach(function(el){
      //console.log('Scalar changed to',el.value());
      t.trigger(el.value());
    });
  }
  el.destroyed.attach(function(){
    t.trigger();
    t.detach();
  });
};
ElementWaiter.prototype.destroy = function(){
  this.parent.destroyed.detach(this.parentDestroyed);
  this.detach();
  for(var i in this){
    delete this[i];
  }
};

function DeStreamer(elemnamearry){
  this.elemnames = {};
  for(var i in elemnamearry){
    this.elemnames[elemnamearry[i]] = 1;
  }
  Collection.call(this);
}
DeStreamer.prototype = Object.create(Collection.prototype,{constructor:{
  value:DeStreamer,
  enumerable:false,
  writable:false,
  configurable:false
}});
DeStreamer.prototype.destream = function(item){
  //console.log('destreaming',item);
  if(item && item[1] && item[1][0] in this.elemnames){
    //console.log('PROCESSING',item[1]);
    this.processItemData(item[1]);
  }
};
DeStreamer.prototype.processItemData = function(itemdata){
  if(typeof itemdata[1] === 'undefined'){
    this.remove(itemdata[0]);
    return;
  }
  var d = this.elementRaw(itemdata[0]);
  if(!d){
    if(itemdata[1] === null){
      this.add(itemdata[0],new Collection());
      return;
    }
    this.add(itemdata[0],new Scalar(itemdata[1]));
  }else{
    if(d.type()==='Scalar'){
      d.alter(itemdata[1],undefined,undefined);
    }
  }
};
DeStreamer.prototype.valueOfElement = function(el){
  switch(el.type()){
    case 'Scalar':
      return el.value();
    case 'Collection':
      return {};
  }
};
DeStreamer.prototype.valueOf = function(elname){
  var el = this.element([elname]);
  if(!el){return;}
  return this.valueOfElement(el);
};
DeStreamer.prototype.attachWaitertoScalar = function(waiter,el,elv){
  if(!el){
    if(!this.waitingSubscribers){
      this.waitingSubscribers = {};
    }
    var elname = waiter.elname;
    delete waiter.elname;
    if(!this.waitingSubscribers[elname]){
      this.waitingSubscribers[elname] = [];
    }
    this.waitingSubscribers[elname].push(waiter);
    return;
  }
  if(typeof elv === 'undefined'){
    elv = this.valueOfElement(el);
  }
  waiter.trigger(elv);
  waiter.attachTo(el);
};
DeStreamer.prototype.subscribeFor = function(elname,cb,ctx){
  var ret = new ElementWaiter(this,cb,ctx);
  ret.elname = elname;
  this.attachWaitertoScalar(ret,this.element([elname]));
  return ret;
};
DeStreamer.prototype.handleNewElement = function(elname,el){
  Collection.prototype.handleNewElement.call(this,elname,el);
  if(this.waitingSubscribers && this.waitingSubscribers[elname]){
    var wss = this.waitingSubscribers[elname];
    delete this.waitingSubscribers[elname];
    var elv = this.valueOfElement(el);
    for(var i in wss){
      var ws = wss[i];
      this.attachWaitertoScalar(wss[i],el,elv);
    }
  }
};

module.exports = DeStreamer;
