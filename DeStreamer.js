var Collection = require('./Collection'),
  Scalar = require('./Scalar');
 
function ElementWaiter(parnt,cb,ctx){
  this.parent = parnt;
  this.parentDestroyed = parnt.destroyed.attach([this,'destroy']);
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
    this.changerIndex = el.changed.attach([this,'scalarChanged']);
  }
  el.destroyed.attach([this,'elementDestroyed']);
};
ElementWaiter.prototype.scalarChanged = function(el){
  this.trigger(el.value());
};
ElementWaiter.prototype.elementDestroyed = function(){
  this.trigger();
  this.detach();
};
ElementWaiter.prototype.destroy = function(){
  if(!this.parent){return;}
  this.parent && this.parent.destroyed && this.parent.destroyed.detach(this.parentDestroyed);
  this.detach();
  for(var i in this){
    delete this[i];
  }
};

function DeStreamer(elemnamearry,options){
  this.destreamerpos = options.from;
  this.destreamerdepth = options.depth||0;
  if(typeof elemnamearry==='object' && elemnamearry instanceof Array){
    this.elemnames = {};
    for(var i in elemnamearry){
      this.elemnames[elemnamearry[i]] = 1;
    }
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
  //console.trace();
  //console.log('destreaming',item);
  if(!this.elementRaw){return;} //me ded
  if(!item){
    return;
  }
  if(item==='DISCARD_THIS'){
    this.destroy();
    return;
  }
  if(typeof item[0] === 'undefined'){
    return;
  }
  var p = item[0],pl = p.length,dd = typeof this.destreamerpos === 'undefined' ? pl-1 : this.destreamerpos+1;
  if(pl<dd){
    return;
  }
  if(pl && pl>dd){
    var n = p[dd];
    //console.log('looking for',n,'in',p);
    var el = this.elementRaw(n);
    if(el && el.destream){
      //console.log('data destreamer at',n,'destreaming');
      el.destream(item);
      //console.log('to',el.dataDebug());
    }else{
      //console.log('no',n,'at',this.dataDebug(),'but',el,'because',item);
    }
    return;
  }
  //console.log('finally',item[1]);
  if(this.elemnames){
    if(item[1] && item[1][0] in this.elemnames){
      //console.log('PROCESSING',item[1]);
      //this.processItemData(item[1]);
      DeStreamer.prototype.processItemData.call(this,item[1]);
    }
  }else{
    //console.log('destreaming',item);
    //this.processItemData(item[1]);
    DeStreamer.prototype.processItemData.call(this,item[1]);
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
      var c;
      if(typeof this.destreamerpos !== 'undefined' && this.destreamerdepth){
        //console.log('new child DeStreamer for',itemdata[0],'with',this.destreamerpos+1,this.destreamerdepth-1);
        c = new DeStreamer('*',{from:this.destreamerpos+1,depth:this.destreamerdepth-1});
      }else{
        //console.log('no child DeStreamer for',itemdata[0],this.destreamerpos,this.destreamerdepth);
        c = new Collection();
      }
      this.add(itemdata[0],c);
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
DeStreamer.prototype.toStream = function(cb,path){
  if(!this.traverseElements){return;}
  path = path || [];
  //console.log('toStream',this.dataDebug());
  this.traverseElements(function(name,elem){
    switch(elem.type()){
      case 'Scalar':
        cb([path,[name,elem.value()]]);
        break;
      case 'Collection':
        cb([path,[name,null]]);
        if(elem && elem.toStream){
          elem.toStream(cb,path.concat([name]));
        }
        break;
    }
  });
};

module.exports = DeStreamer;
