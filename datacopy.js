function Scalar () {
	var data = undefined;

	var changed = new HookCollection(); //will be fired only upon changes
	var updated = new HookCollection(); //will be fired after every set

	var destroyed = new HookCollection();

	this.set = function (value) {
		var old = data;
		data = value;
		updated.fire(old, value);
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
	this.updated = updated;
}

function Collection (){
	var self = this;
	var data = {};

	/// veoma sumnjiv set queue-ova ...
	var elementAdded = new HookCollection();
	var elementRemoved = new HookCollection();

	//ovo mi vec malo deluje razumnije ...
  var txnBegins = new HookCollection();
  var txnEnds = new HookCollection();

	var transaction_type_maps = {};


	var reset = new HookCollection();


	this.dump = function () {
		var ret = {};
		for (var i in data) {
			if (data[i] instanceof Scalar) {
				ret[i] = data[i].value();
			}else{
				ret[i] = data[i].dump();
			}
		}
		return ret;
	}

	this.tree = function (path) {
		var top_ = typeof(path);
		if ('undefined'=== top_) return undefined;
		if ('string' === top_) return [this, data[path]];
		if ('number' === top_) return [this, data[path]];
		if ('object' === top_ && !(path instanceof Array)) return undefined;

		var ret = [this];

		var t = this;
		var p = path.slice();

		while (t && p.length) {
			t = t.element(p.shift());
			ret.push(t);
		}
		return ret;
	}

	this.element = function (path) {
		var tree = this.tree(path);
		return (tree) ? tree[tree.length-1] : undefined;
	}

	function isObj (obj) {return (typeof(obj) === 'object');}
	function objKeys (obj) {
		var ret = [];
		for (var i in obj) {
			ret.push(i);
		}
		return ret;
	}
	var actions = {
		'set' : function (op, d) {
			if (op.length == 0 && isObj(d) && objKeys(d).length == 0) {
				data = d;
				reset.fire();
				return;
			}

			var path = op.slice(0);
			var c_parent = this;

			//secure path existance .... /// TODO:remove in future, autovivification should not be allowed ...
			for (var i in path) {
				//TODO: introduce some checks over here ...
				if (i == path.length -1) break;
				var itm = c_parent.element(path[i]);
				if (!itm) {
					/// we're talking about collections here ... no way downstairs otherwise ... 
					itm = c_parent.set (path[i], {});
				}
				c_parent = itm;
			}

			var name = path.pop();
			c_parent.set(name, d);
		},
		'remove' : function (p) {
			var prnt = this;
			for (var i in p) {
				var name = p[i];
				if (i == p.length-1) break;
				prnt = prnt.element(p[i]);
				if (!prnt) return console.error('UNABLE TO FIND PATH ...');
			}
			prnt.remove(name);
			return;
		},
		'start' : function (n) {
			this.start(n);
		},
		'end': function (n) {
			this.end(n);
		}
	};



	this.set = function (name, d) {
		var entity = data[name];
		var should_fire = !(data[name] && true);

		if ('object' === typeof(d)) {
			if (entity && !(entity instanceof Collection)) {
				(entity instanceof Scalar) && entity.destroy();
				entity = undefined;
			}
			if (!entity) { entity = new Collection(); should_fire = true; }
			for (var i in d) entity.set(i, d);
		}else{

			if (entity && !(entity instanceof Scalar)) {
				(entity instanceof Collection) && entity.destroy(); 
				entity = undefined;
			}
			if (!entity) {entity = new Scalar(); should_fire = true;}
			entity.set(d);
		}
		data[name] = entity;
		should_fire && elementAdded.fire(name, entity);
		return entity;
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

	this.commit = function (txn) {
		//console.log('got txn ', txn);
		if (txn.length < 2) {
			console.error('IVALID TXN length ', txn);
			return;
		}
		try {
		var action = txn.shift(), path = txn.shift(), data = (txn.length) ? txn.shift() : undefined;
		//console.log(action, path, data);
		if ('function' === typeof (actions[action])) {
			actions[action].call(this,path, data);
		}
		}catch (e) {
			//console.log('ERROR ',e,txn);
		}
	}

  this.elementAdded = elementAdded;
  this.elementRemoved = elementRemoved;
  this.txnBegins = txnBegins;
  this.txnEnds = txnEnds;
	this.reset = reset;

	this.subscribe_bunch = function (map) {
		var ret = {};
		for (var i in map) {
			if (this[i] instanceof HookCollection) ret[i] = this[i].attach (map[i]);
		}
		return ret;
	}
}
