function Scalar () {
	var data = undefined;
	changed = new HookCollection();
	destroyed = new HookCollection();
	this.set = function (value) {
		var old = data;
		data = value;
		if (old != value) changed.fire(old,value);
	};
  this.destroy = function(){
    data = undefined;
    destroyed.fire();
    changed.destruct();
    destroyed.destruct();
  }
	this.value = function () {return data;}
  this.changed = changed;
  this.destroyed = destroyed;
}

function Collection (){
	var self = this;
	var data = {};
	var elementAdded = new HookCollection();
	var elementRemoved = new HookCollection();
  var txnBegins = new HookCollection();
  var txnEnds = new HookCollection();

	this.element = function (path) {
		var top_ = typeof(path);
		if ('undefined'=== top_) return undefined;
		if ('string' === top_) return data[path];
		if ('number' === top_) return data[path];
		if ('object' === top_ && !(path instanceof Array)) return undefined;

		var t = this;
		var p = path.slice();

		while (t && p.length) {
			t = t.element(p.shift());
		}
		return t;
	}
	this.add = function (name, entity) {
		data[name] = entity;
		elementAdded.fire(name);
	};
  this.remove = function (name){
    if(typeof data[name] !== 'undefined'){
      data[name].destroy();
      delete data[name];
      elementRemoved(name);
    }
  };
  this.start = function(txnalias){
    txnBegins.fire(txnalias);
  };
  this.end = function(txnalias){
    txnEnds.fire(txnalias);
  };

  this.destroy = function(){
    for(var i in data){
      data[i].destroy();
      delete data[i];
      elementRemoved.fire(i);
    }
    data = undefined;
    elementAdded.destruct();
    elementRemoved.destruct();
    txnBegins.destruct();
    txnEnds.destruct();
  };

  this.elementAdded = elementAdded;
  this.elementRemoved = elementRemoved;
  this.txnBegins = txnBegins;
  this.txnEnds = txnEnds;
}

