function HookCollection(){
  this.collection = {};
	this.counter = 0;
};
HookCollection.prototype.empty = function(){
	var c = 0;
	for(var n in this.collection){
		return false;
	}
  return true;
};
HookCollection.prototype.inc = function(){
	var t = this;
	function _inc(){
		t.counter++;
		if(t.counter>10000000){
			t.counter=1;
		}
	};
	_inc();
	while(this.counter in this.collection){
		_inc();
	}
};
HookCollection.prototype.attach = function(cb){
  if(typeof cb === 'function'){
		this.inc();
    this.collection[this.counter]=cb;
		return this.counter;
  }
};
HookCollection.prototype.detach = function(i){
	delete this.collection[i];
};
HookCollection.prototype.fire = function(){
  var c = this.collection;
  var fordel=[];
  var pa = Array.prototype.slice.call(arguments);
  for(var i in c){
    try{
      var fqn = c[i];
      fqn.apply(null,pa);
    }
    catch(e){
      console.log(e);
      console.log(e.stack);
      fordel.unshift(i);
    }
  }
  var fdl = fordel.length;
  for(var i=0; i<fdl; i++){
		delete c[fordel[i]];
  }
};
/* controversial
HookCollection.prototype.fireAndForget = function(){
  var c = this.collection;
  var pa = Array.prototype.slice.call(arguments);
  for(var i in c){
    try{
      c[i].apply(null,pa);
    }
    catch(e){
      console.log(e);
      console.log(e.stack);
    }
  }
	this.collection = {};
}
*/
HookCollection.prototype.destruct = function(){
  for(var i in this.collection){
    delete this.collection[i];
  }
}


function Scalar(value){
  var tov = typeof value;
  if(!((tov==='string')||(tov==='number'))){
    throw 'Scalar can be nothing but a string or a number';
  }
  var data = value;
  var changed = new HookCollection();
  this.alter = function(newval){
    if(data!==newval){
      var oldval=data;
      data=newval;
      changed.fire('',oldval,newval);
    }
  }
  this.changed = changed;
  var destroyed = new HookCollection();
  this.destroy = function(){
    destroyed.fire();
    changed.destroy();
    changed = undefined;
    destroyed.destroy();
    destroyed = undefined;
  }
  this.destroyed = destroyed;
  this.value = function(){
    return data;
  };
  this.stringify = function(){
    return JSON.stringify(data);
  };
  this.parse = function(value){
    data = JSON.parse(value);
  };
}

function Collection(defaultelementconstructor){
  var data = {};
  var defaultconstuctor = defaultelementconstructor || function(){
    throw 'No default constructor provided';
  };
  var newElement = new HookCollection();
  var elementDestroyed = new HookCollection();
  this.addScalar = function(name,value){
    this.add(name,value,Scalar);
  };
  var add = function(name,value,constructor){
    if(typeof constructor !== 'function'){
      constructor = Collection;
    }
    var element = new constructor(value);
    data[name] = element;
    newElement.fire(name,element.stringify());
  };
  this.add = add;
  this.destroy = function(name){
    var el = data[name];
    if(typeof el === 'undefined'){
      return;
    }
    delete data[name];
    el.destroy();
    elementDestroyed.fire(name);
  };
  this.element = function(name){
    return data[name];
  };
  this.newElement = newElement;
  this.elementDestroyed = elementDestroyed;
  this.stringify = function(){
    var ret = {};
    for(var i in data){
      ret[i] = data[i].stringify();
    }
    return JSON.stringify(ret);
  };
  this.parse = function(value){
    var vj = JSON.parse(value);
    for(var i in vj){
      if(data[i]){
        data[i].parse(vj[i]);
      }else{
        add(i,vj[i],defaultconstuctor);
      }
    }
  };
}

function Series(defaultelementconstructor,capacity){
  Collection.apply(this,[defaultelementconstructor]);
  this.addScalar('capacity',0);
  var t = this;
  this.setCapacity = function(cap){
    if(!(cap>0)){
      return;
    }
    var curcap = t.element('capacity').value();
    if(curcap===cap){
      return;
    }
    if(curcap>cap){
      for(var i=curcap; i<cap; i++){
        t.remove(i);
      }
    }
    if(curcap<cap){
      for(var i=curcap; i<cap; i++){
        t.add(i,undefined,Player);
      }
    }
  }
  if(capacity){
    this.parse(stringified);
  }
}
