function Factory (json_or_stuct) {
	var to_js = typeof(json_or_stuct);

	if (to_js == 'string') {
		try {
			json_or_stuct = JSON.parse(json_or_stuct);
		}catch (e) {}
	}
	to_js = typeof(json_or_stuct);
	if (to_js === 'object' ) {
		var ret = new Collection();
		for (var i in json_or_stuct) {
			ret.add(i, json_or_stuct[i]);
		}
	}else{
		var ret = new Scalar();
		ret.alter(json_or_stuct);
	}
	return ret;
}

function Scalar () {
	var data = null;
	this.changed = new HookCollection();
	this.alter = function (value) {
		var old = data;
		data = value;
		if (old != value) this.changed.fire(old,value);
	}
	this.value = function () {return data;}
}

function Collection (){
	var self = this;
	var data = {};
	this.element = function (path) {
		var top_ = typeof(path);
		if ('undefined'=== top_) return undefined;
		if ('string' === top_) return data[path];
		if ('object' === top_ && !(path instanceof Array)) return undefined;

		var t = this;
		var p = path.slice();

		while (p.length) {
			t = t.element(p.shift());
		}
		return t;
	}

	this.value = function () {
		var ret = {};
		for (var i in data) {
			ret[i] = data[i].value();
		}
		return ret;
	}

	this.onAddedElement = new HookCollection();
	this.add = function (name, val) {
		data[name] = Factory(val);
		this.onAddedElement.fire(name, val);
	}

	var operations = {
		alter: function (params) {
			var elemt = (params.path) ? self.element(params.path) : undefined;
			if (!elemt) return;
			elemt.alter(params.value);
		},
		add : function (params) {
			if (!params) return;
			var elemt = (params.path) ? self.element(params.path) : undefined;
			if (!elemt) return;
			elemt.add(params.name, params.value);
		},
		remove: function(params){
		}
	};

	this.commit = function (data) {
		//uradi nesto sa alias - om ...
		if (!data.batch) return;
		for (var i in data.batch) {
			var d = data.batch[i];
			if (d.action && 'function' === typeof(operations[d.action])) operations[d.action](d);
		}
	}
}
