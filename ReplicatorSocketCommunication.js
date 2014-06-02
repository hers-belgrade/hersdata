var ReplicatorCommunication = require('./ReplicatorCommunication'),
  Timeout = require('herstimeout'),
  zlib = require('zlib');

function ReplicatorSocketCommunication(data){
  ReplicatorCommunication.call(this,data);

  this.bufferizingthreshold=100;
  this.lenBuf = new Buffer(4);
  this.lenBufread = 0;
  this.bytesToRead = -1;
  this.dataRead = '';
  this.execQueue = [];
  this.sendingQueue = [];
  this.sending = false;
  this.sendingBuffs = [];
  this.createUnzip();
  this.dataCursor = 0;
  this.incomingData = [];
  this._auxSendingQueue = undefined;

  var self = this;
  data.replicationInitiated.attach (function () {
    if (!self._auxSendingQueue) return;
    Array.prototype.push.apply (self.sendingQueue, self._auxSendingQueue);
    self._auxSendingQueue = undefined;
    self._internalSend();
  });
};
ReplicatorSocketCommunication.prototype = Object.create(ReplicatorCommunication.prototype,{constructor:{
  value:ReplicatorSocketCommunication,
  enumerable:false,
  writable:true,
  configurable:true
}});
ReplicatorSocketCommunication.prototype.destroy = function(){
  this.socket && this.socket.destroy();
  delete this.socket;
  ReplicatorCommunication.prototype.destroy.call(this);
};
ReplicatorSocketCommunication.prototype.createUnzip = function(){
  this.unzip = zlib.createGunzip();
  var t = this;
  this.unzip.on('data',function(chunk){
    if(typeof t.dataRead === 'undefined'){
      return;
    }
    //console.log('got data');
    t.dataRead+=chunk.toString('utf8');
  });
  this.unzip.on('end',function(){
    Timeout.next(t,'handleUnzipEnd');
  });
  this.unzip.on('error',function(){
    console.log('unzip error',arguments);
    process.exit(0);
  });
  //console.log('new unzip created');
};
ReplicatorSocketCommunication.prototype.handleUnzipEnd = function(){
  if(this.dataRead){
    //var n = Timeout.now();
    var eq = JSON.parse(this.dataRead);
    this.dataRead = '';
    Array.prototype.push.apply(this.execQueue,eq);
    //console.log(this.execQueue);
    this.maybeExec();
    //console.log('exec time',Timeout.now()-n);
  }
  this.createUnzip();
  this.processData(this.currentData,this.dataCursor);
};
ReplicatorSocketCommunication.prototype._internalSend = function(buf){
  if(!this.socket){return;}
  if(!this.sendingQueue.length){
    //console.log(this.__id,'got out because there is nothing to send');
    return;
  }
  var sl = this.sendingQueue.length;
  if(sl>this.bufferizingthreshold+1){ //so that we leave at least on element in the queue
    sl=this.bufferizingthreshold;
  }
  var sq = this.sendingQueue.splice(0,sl);
  this.start = Timeout.now();
  this.bufferize(sq);
  if(this.sending){
    //console.log(this.__id,'got out because I am already sending');
    return;
  }
  this.sending = true;
  /*
  var zip = zlib.createGzip({
    level:9
  });
  var t = this;
  zip.on('data',function(chunk){
    t.sendingBuffs && t.sendingBuffs.push(chunk);
  });
  zip.on('end',function(){
    Timeout.next(t,'handleZipEnd');
  });
  zip.write(sqb);
  zip.end();
  */
  this.sendMore();
};
ReplicatorSocketCommunication.prototype.bufferize = function(sq){
  var sqb = new Buffer(JSON.stringify(sq),'utf8');
  var lb = new Buffer(4);
  var sqbl = sqb.length;
  if(sqbl>64*1024){
    this.bufferizingthreshold--;
  }else{
    this.bufferizingthreshold++;
  }
  if(this.bufferizingthreshold>200){
    this.bufferizingthreshold=200;
  }
  if(this.bufferizingthreshold<50){
    this.bufferizingthreshold=50;
  }
  lb.writeUInt32LE(sqbl,0);
  this.sendingBuffs.push(lb);
  this.sendingBuffs.push(sqb);
}
ReplicatorSocketCommunication.prototype.handleZipEnd = function(){
  if(!this.sendingBuffs){return;}
  var tl = 0;
  for (var i in this.sendingBuffs){
    tl+=this.sendingBuffs[i].length;
  }
  var lb = new Buffer(4);
  lb.writeUInt32LE(tl,0);
  this.sendingBuffs.unshift(lb);
  this.sendMore();
};
ReplicatorSocketCommunication.prototype.sendobj = function(obj){
  if(!this.sendingQueue){return;}
  this.sendingQueue.push(obj);
  this._internalSend();
};
ReplicatorSocketCommunication.prototype.sendMore = function(){
  if(!this.sendingBuffs){
    return;
  }
  if(!this.sendingBuffs.length){
    this.sending = false;
  }else{
    this.start = this.now;
    var b = this.sendingBuffs.shift();
    this.sendingLength = b.length;
    if(this.socket && this.socket.writable){
      if(this.socket.write(b)){
        this.sendingDoneHandler();
      }
    }
  }
  this._internalSend();
};
ReplicatorSocketCommunication.prototype.sendingDoneHandler = function(){
  var now = Timeout.now(), elaps = now - this.start;
  ReplicatorSocketCommunication.sendingTime += elaps;
  ReplicatorSocketCommunication.sentBytes += this.sendingLength;
  ReplicatorSocketCommunication.output -= this.sendingLength;
  //console.log(this.sendingLength/elaps);
  //console.log(this.__id,'drain',this.sendingBuffer.length);
  Timeout.next(this,'sendMore');
};


ReplicatorSocketCommunication.prototype.purge = function () {
  delete this.socket;
  ReplicatorCommunication.prototype.purge.apply(this, arguments);
}

ReplicatorSocketCommunication.prototype.listenTo = function(socket){
  var t = this;
  console.log('will recreate socket ...');
  if(this.sendingQueue && this.sendingQueue.length){
    this._auxSendingQueue = this.sendingQueue;
  }
  this.sendingQueue = [];
  this.socket = socket;
  this.socket.setNoDelay(true);
  socket.on('data',function(data){
    //console.log(t.__id,'data');
    Timeout.next(t,'processData',data);
  });
  socket.on('drain',function(){t.sendingDoneHandler()});
  this._internalSend();
};
ReplicatorSocketCommunication.prototype.processData = function(data,offset){
  if(!this.socket){return;}
  var _rcvstart = Timeout.now();
  var i=(offset||0);
  if((this.currentData && data!==this.currentData) || (i!==this.dataCursor)){
    //console.log(i,'<>',this.dataCursor);
    this.incomingData.push(data);
    return;
  }
  this.currentData = data;
  //console.log('data',data.length,'long, reading from',i);
  for(; (this.bytesToRead<0)&&(i<data.length)&&(this.lenBufread<4); i++,this.lenBufread++){
    this.lenBuf[this.lenBufread] = data[i];
    ReplicatorSocketCommunication.rcvBytes++;
    //console.log(this.lenBuf);
  }
  if(this.bytesToRead<0){
    if(this.lenBufread!==4){
      ReplicatorSocketCommunication.rcvingTime += (Timeout.now()-_rcvstart);
      delete this.currentData;
      this.dataCursor=0;
      if(this.incomingData.length){
        this.processData(this.incomingData.shift());
      }
      return;
    }
    this.bytesToRead = this.lenBuf.readUInt32LE(0);
    ReplicatorSocketCommunication.rcvBytes+=4;
  }else{
    //console.log('still',this.bytesToRead);
  }
  //console.log('should read',this.bytesToRead,'bytes');
  var canread = (data.length-i);
  if(canread>this.bytesToRead){
    canread=this.bytesToRead;
  }
  this.dataRead+=data.toString('utf8',i,i+canread);
  //this.unzip.write(data.slice(i,i+canread));
  this.bytesToRead-=canread;
  i+=canread;
  this.dataCursor = i;
  if(this.bytesToRead===0){
    this.bytesToRead=-1;
    this.lenBufread=0;
    this.handleUnzipEnd();
    //this.unzip.end();
  }else{
    //console.log('at',i,'data is',data.length,'long, now what?');
    if(i===data.length){
      delete this.currentData;
      this.dataCursor=0;
      if(this.incomingData.length){
        this.processData(this.incomingData.shift());
      }
    }else{
      this.processData(data,i);
    }
  }
  ReplicatorSocketCommunication.rcvingTime += (Timeout.now()-_rcvstart);
};
ReplicatorSocketCommunication.prototype.exec = function(){
  if(!this.execQueue){return;}
  try{
    var drp = this.execQueue.shift();
    //if(!dr){return;}
    //var drp = JSON.parse(dr);
    //console.log('ql >',this.execQueue.length);
    if(drp){
      var es = Timeout.now();
      this.handOver(drp);
      //ReplicatorSocketCommunication.execTime += (Timeout.now()-es);
      //ReplicatorSocketCommunication.input-=dr.length;
    }
  }catch(e){
    //console.log('ERROR processing input', util.inspect(drp,false,null,false));
    console.log('Exception e',e);
    console.log(drp);
    console.log(e.stack);
  }
  this.maybeExec();
};
ReplicatorSocketCommunication.prototype.maybeExec = function(){
  if(this.execQueue && this.execQueue.length){
    Timeout.next(this,'exec');
  }
};

module.exports = ReplicatorSocketCommunication;
