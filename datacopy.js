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

	var transaction_handlers = {};
	var current_transaction = undefined;
	var affected_paths = undefined;

	var reset = new HookCollection();

	var predefined_path_hooks = [];

	this.registerPredefinedHook = function (path, cb) {
		return predefined_path_hooks.push({path:path, cb:cb});
	}

	this.value = function () {
		var ret = {};
		for (var i in data) {
			ret[i] = data[i].value();
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
			//console.log('===', op);
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
			execute_transaction_handler('set', op, d);
			affected_paths && affected_paths.push(op);
			check_on_predefined('set', op, d);
		},
		'remove' : function (p) {
			var prnt = this;
			for (var i in p) {
				var name = p[i];
				if (i == p.length-1) break;
				prnt = prnt.element(p[i]);
				if (!prnt) {
					return console.error('UNABLE TO FIND PATH ...');
				}
			}
			prnt.remove(name);
			execute_transaction_handler('remove', p);
			affected_paths && affected_paths.push(p);
			check_on_predefined('remove', p);
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
      elementRemoved.fire(name);
    }
  };

	this.register_transaction_handler = function (name, map) {
		if (!transaction_handlers[name]) transaction_handlers[name] = [];
		return transaction_handlers[name].push(map)-1;
	}

	this.unregister_transaction_handler = function (name,index) {
		if (!transaction_handlers[name] || transaction_handlers[name].length < index) return;
		transaction_handlers[name][index] = undefined;
	}

	function execute_transaction_handler (primitive,name, data) {
		if (!current_transaction || !transaction_handlers[current_transaction]) return;
		var th = transaction_handlers[current_transaction];
		for (var i in th) ('function' === typeof((th[i] || {})[primitive])) && th[i][primitive](name,data);
	}

	function check_on_predefined (primitive, path, data) {
		for (var i in predefined_path_hooks) {
			var pph = predefined_path_hooks[i];
			if (!pph.path || !('function' === typeof(pph.cb))) continue;
			var pp, p; // pp: path_pattern, p: path
			var args = [];
		 	if (pph.path[pph.path.length-1] == '*') {
				p = path.slice(0, pph.path.length-1);
				pp = pph.path.slice(0, pph.path.length-1);
			}	else {
				p = path.slice(0);
				pp = pph.path;
			}

			if (!pp || !p) continue;
			if (pp.length != p.length) continue;
			var ok = true;

			for (var j in pp) {
				if (pp[j] == '%') {
					args.push(p[j]);
					continue;
				}
				if (pp[j] != p[j]) {
					ok = false;
					break;
				}
			}
			if (!ok) continue;
			args = args.concat(path.slice(pph.path.length-1));
			pph.cb(primitive, path, data, args);
		}
	}

  this.start = function(txnalias){
		current_transaction = txnalias;
    txnBegins.fire(txnalias);
		execute_transaction_handler('start');
		affected_paths = [];
  };

  this.end = function(txnalias){
		var afd = {};


		var ap = affected_paths.slice();
		for (var i in ap) {
			var cp = ap[i];
			if (cp.length == 0) continue;
			var t = afd;
			for (var j = 0; j < cp.length-1; j++) {
				if (!t[cp[j]]) t[cp[j]] = {};
				t = t[cp[j]];
			}
			var el = this.element(affected_paths[i]);

			t[cp[j]] = (el) ? el.value() : undefined;
		}


    txnEnds.fire(txnalias, affected_paths, afd);
		execute_transaction_handler('end', affected_paths, afd);
		current_transaction = undefined;
		affected_paths = undefined;
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
			if ('function' === typeof (actions[action])) {
				actions[action].call(this,path, data);
			}
		}catch (e) {
			console.log(e.stack);
			console.log('ERROR ',e,txn);
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
