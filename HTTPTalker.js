var http = require('http'),
  Timeout = require('herstimeout'),
  executable = require('hersexecutable');

function HTTPTalker(host,port){
  this.host = host;
  this.port = port;
};
HTTPTalker.prototype.queryize = function(obj){
  var q = '';
  for(var i in obj){
    if(q){
      q+='&';
    }
    q+=i+'='+encodeURIComponent(obj[i]);
  }
  return q ? '?'+q : '';
};
HTTPTalker.prototype.tell = function(page,obj,cb){
  var t = this;
  if(!executable.isA(cb)){
    return;
  }
  http.request({
    host:this.host,
    port:this.port,
    path:page+this.queryize(obj)
  },function(res){
    var data = '',_cb = cb;
    res.setEncoding('utf8');
    res.on('data',function(chunk){
      data+=chunk;
    });
    res.on('end',function(){
      try{
        data = JSON.parse(data);
      }
      catch(e){
        console.log(e);
      }
      executable.call(_cb,data);
    });
  }).on('error',function(e){
    console.log('HTTPTalker error',e.code ? e.code : '', t.host, t.port);
    Timeout.set(t,1000,'tell',page,obj,cb);
  }).end();
};

module.exports = HTTPTalker;
