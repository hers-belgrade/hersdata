var DataUser = require('./DataUser'),
  HookCollection = require('./hookcollection');

function PathTranslator(path,replaceleading){
  this.translate = typeof replaceleading === 'undefined' ? function(cb){
    var _cb = cb,mypath = path;
    return function(item){
      if(!(typeof item === 'object')){return;}
      _cb([mypath,item[1]]);
    };
  } : function(cb){
    var _cb = cb,mypath = path;
    return function(item){
      if(!(typeof item === 'object' && item[0] && item[0].length>=replaceleading)){return;}
      _cb([item[0] && item[0].slice ? mypath.concat(item[0].slice(replaceleading)) : mypath,item[1]]);
    };
  };
  this.hook = new HookCollection();
  this.fire = this.translate((function(h){
    var _h = h;
    return function(item){
      //console.log('hook firing',item);
      if(!_h.counter){
        return;
      }
      _h.fire(item);
    }
  })(this.hook));
  this.replacementpath = path.slice();
};
PathTranslator.prototype.attach = function(cb){
  return this.hook.attach(cb);
};
PathTranslator.prototype.detach = function(cbid){
  this.hook.detach(cbid);
};

function Broadcaster(data,createcb,username,realmname,roles){
  if(!data){
    console.log('no data');
    return;
  }
  this.broadcast = new HookCollection();
  DataUser.call(this,data,createcb,undefined,username,realmname,roles);
}
Broadcaster.prototype = Object.create(DataUser.prototype,{constructor:{
  value:Broadcaster,
  enumerable:false,
  writable:false,
  configurable:false
}});
Broadcaster.prototype.say = function(item){
  if(!this.broadcast){return;}
  this.broadcast.fire(item);
  if(this.translators){
    for(var i in this.translators){
      this.translators[i].fire(item);
    }
  }
};
Broadcaster.prototype.describeElem = function(elem,cb){
  for(var i in elem){
    cb([this.path,[i,elem[i]]]);
  }
  for(var i in elem){
    var e = elem[i];
    if(typeof e === 'object'){
      this.describeElem(e,cb);
    }
  }
};
Broadcaster.prototype.describe = function(cb,translatorname){
  if(this.translators){
    var t = this.translators[translatorname];
    if(t){
      cb = t.translate(cb);
    }
  }
  DataUser.prototype.describe.call(this,cb);
};
Broadcaster.prototype.attach = function(cb,translatorname){
  this.describe(cb,translatorname);
  if(!translatorname){
    return this.broadcast.attach(cb);
  }else if(this.translators){
    var t = this.translators[translatorname];
    if(t){
      return t.attach(cb);
    }
  }
};
Broadcaster.prototype.detach = function(id,translatorname){
  if(!translatorname){
    this.broadcast.detach(id);
  }else if(this.translators){
    var t = this.translators[translatorname];
    if(t){
      t.detach(id);
    }
  }
};
Broadcaster.prototype.createTranslator = function(name,path,replaceleading){
  if(!this.translators){
    this.translators = {};
  }
  this.translators[name] = new PathTranslator(path,replaceleading);
};

module.exports = Broadcaster;
