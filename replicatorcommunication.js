var Timeout = require('herstimeout'),
  zlib = require('zlib');

var __start = Timeout.now();
var __id = 0;
function ReplicatorCommunication(data){
  __id++;
  this.__id = __id;
  this.lenBuf = new Buffer(4);
  this.lenBufread = 0;
  this.bytesToRead = -1;
  this.dataRead = '';
  this.data = data;
  this.execQueue = [];
  this.sendingQueue = [];
  this.sending = false;
  this.zip = zlib.createGzip({
    level:9
  });
  this.sendingBuffs = [];
  var t = this;
  this.zip.on('data',function(chunk){
    t.sendingBuffs.push(chunk);
  });
  this.zip.on('end',function(){
    var tl = 0;
    for (var i in t.sendingBuffs){
      tl+=t.sendingBuffs[i].length;
    }
    var lb = new Buffer(4);
    lb.writeUInt32LE(tl,0);
    t.sendingBuffs.unshift(lb);
    if(!t.socket){process.exit(0);}
    t.socket.write(t.sendingBuffs.shift());
  });
  this.unzip = zlib.createGunzip();
  var t = this;
  var incomingdata='';
  this.unzip.on('data',function(chunk){
    incomingdata+=chunk;
  });
  this.unzip.on('end',function(){
    console.log('incoming',incomingdata);
    var eq = JSON.parse(incomingdata);
    Array.prototype.push.apply(t.execQueue,eq);
    console.log(t.execQueue);
    t.maybeExec();
  });
};
ReplicatorCommunication.prototype._internalSend = function(buf){
  if(!this.socket){return;}
  if(!this.sendingQueue.length){
    //console.log(this.__id,'got out because there is nothing to send');
    return;
  }
  if(this.sending){
    //console.log(this.__id,'got out because I am already sending');
    return;
  }
  this.sending = true;
  this.start = Timeout.now();
  var sqb = new Buffer(JSON.stringify(this.sendingQueue),'utf8');
  this.sendingQueue = [];
  var bufs = [];
  this.zip.write(sqb);
  this.zip.end();
  return;
  try{
    //console.log(this.__id,'sending buffer',buf.toString());
    var sq = this.sendingQueue;
    this.sendingQueue = [];
    var sl = 0;
    var sls = [];
    for(var i in sq){
      var _sl = Buffer.byteLength(sq[i],'utf8');
      sls.push(_sl);
      sl += _sl;
    }
    var bl = sl+sq.length*4;
    var b = new Buffer(bl);
    var cursor = 0;
    for(var i in sq){
      var _sl = sls[i];
      b.writeUInt32LE(_sl,cursor);
      cursor+=4;
      b.write(sq[i],cursor,_sl,'utf8');
      cursor+=_sl;
    }
    this.sendingLength = bl;
    this.start = Timeout.now();
    this.socket.write(b);
  }
  catch(e){
    //socket closed...
  }
};
ReplicatorCommunication.prototype.send = function(obj){
  if(!(this.socket)){return;}
  this.sendingQueue.push(obj);
  this._internalSend();
  return;
  var objstr = JSON.stringify(obj);
  if(!objstr){return;}
  var tsbl = this.sendingBuffer.length;
  var b = new Buffer(tsbl+4+Buffer.byteLength(objstr,'utf8'));
  if(tsbl){
    this.sendingBuffer.copy(b);
  }
  b.writeUInt32LE(objstr.length,tsbl);
  b.write(objstr,tsbl+4,b.length-tsbl-4,'utf8');
  this.sendingBuffer = b;
  //console.log(this.__id,'outer sending',this.sendingBuffer.length);
  this._internalSend();
  return;
  var objstr = JSON.stringify(obj);
  if(!objstr){return;}
  var strbuf = new Buffer(objstr, 'utf8');
  ReplicatorCommunication.output += strbuf.length;
  if(this.sending){
    //console.log(this.__id,'pushing buffer',strbuf.toString());
    this.sendingQueue.push(strbuf);
  }else{
    this._internalSend(strbuf);
  }
};
ReplicatorCommunication.prototype.listenTo = function(socket){
  var t = this;
  this.socket = socket;
  this.socket.setNoDelay(true);
  socket.on('data',function(data){
    //console.log(t.__id,'data');
    t.processData(data);
  });
  socket.on('drain',function(){
    var elaps = Timeout.now() - t.start;
    ReplicatorCommunication.sendingTime += elaps;
    ReplicatorCommunication.sentBytes += t.sendingLength;
    ReplicatorCommunication.output -= t.sendingLength;
    //console.log(t.sendingLength/elaps);
    //console.log(t.__id,'drain',t.sendingBuffer.length);
    if(!t.sendingBuffs.length){
      t.sending = false;
    }else{
      t.socket.write(t.sendingBuffs.shift());
    }
    t._internalSend();
  });
};
ReplicatorCommunication.prototype.processData = function(data,offset){
  if(!this.socket){return;}
  var _rcvstart = Timeout.now();
  var i=(offset||0);
  //console.log('data',data.length,'long, reading from',i);
  for(; (this.bytesToRead<0)&&(i<data.length)&&(this.lenBufread<4); i++,this.lenBufread++){
    this.lenBuf[this.lenBufread] = data[i];
    ReplicatorCommunication.rcvBytes++;
    //console.log(this.lenBuf);
  }
  if(this.bytesToRead<0){
    if(this.lenBufread!==4){
      ReplicatorCommunication.rcvingTime += (Timeout.now()-_rcvstart);
      return;
    }
    this.bytesToRead = this.lenBuf.readUInt32LE(0);
    ReplicatorCommunication.rcvBytes+=4;
  }
  //console.log('should read',this.bytesToRead,'bytes');
  var canread = (data.length-i);
  if(canread>this.bytesToRead){
    canread=this.bytesToRead;
  }
  //this.dataRead+=data.toString('utf8',i,i+canread);
  this.unzip.write(data.slice(i,i+canread));
  this.bytesToRead-=canread;
  i+=canread;
  if(this.bytesToRead===0){
    this.bytesToRead=-1;
    this.lenBufread=0;
    if(this.socket){
      this.unzip.end();
      this.execQueue.push(this.dataRead);
      ReplicatorCommunication.input+=this.dataRead.length;
      this.dataRead = '';
      //console.log('ql <',this.execQueue.length);
      this.maybeExec();
      ReplicatorCommunication.rcvingTime += (Timeout.now()-_rcvstart);
      this.processData(data,i);
      return;
    }
  }
  ReplicatorCommunication.rcvingTime += (Timeout.now()-_rcvstart);
};
ReplicatorCommunication.prototype.exec = function(){
  if(!this.execQueue){return;}
  try{
    var drp = this.execQueue.shift();
    //if(!dr){return;}
    //var drp = JSON.parse(dr);
    //console.log('ql >',this.execQueue.length);
    if(drp){
      var es = Timeout.now();
      this.data.processInput(this,drp);
      //ReplicatorCommunication.execTime += (Timeout.now()-es);
      //ReplicatorCommunication.input-=dr.length;
    }
  }catch(e){
    //console.log('ERROR processing input', util.inspect(drp,false,null,false));
    console.log(drp);
    console.log(e.stack);
    console.log(e);
  }
  this.maybeExec();
};
ReplicatorCommunication.prototype.maybeExec = function(){
  if(this.execQueue && this.execQueue.length){
    process.nextTick((function(t){var _t=t; return function(){_t.exec();};})(this));
  }
};
ReplicatorCommunication.metrics = function(){
  var _n = Timeout.now(), elaps = _n-__start,
    st=ReplicatorCommunication.sendingTime,rt=ReplicatorCommunication.rcvingTime,et=ReplicatorCommunication.execTime,
    rb=ReplicatorCommunication.rcvBytes,sb=ReplicatorCommunication.sentBytes;
  __start = _n;
  ReplicatorCommunication.sendingTime=0;
  ReplicatorCommunication.rcvingTime=0;
  ReplicatorCommunication.execTime=0;
  ReplicatorCommunication.rcvBytes=0;
  ReplicatorCommunication.sentBytes=0;
  return {buffer:{rx:ReplicatorCommunication.input,tx:ReplicatorCommunication.output},utilization:{rx:~~(rt*100/elaps),tx:~~(st*100/elaps),exec:~~(et*100/elaps)},traffic:{tx:sb,rx:rb}};
};
ReplicatorCommunication.input = 0;
ReplicatorCommunication.output = 0;
ReplicatorCommunication.rcvingTime = 0;
ReplicatorCommunication.sendingTime = 0;
ReplicatorCommunication.execTime = 0;
ReplicatorCommunication.rcvBytes = 0;
ReplicatorCommunication.sentBytes = 0;


module.exports = ReplicatorCommunication;
