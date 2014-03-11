var ReplicatorCommunication = require('./ReplicatorCommunication'),
  Timeout = require('herstimeout'),
  zlib = require('zlib');

function ReplicatorSocketCommunication(data){
  ReplicatorCommunication.call(this,data);
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
};
ReplicatorSocketCommunication.prototype = new ReplicatorCommunication();
ReplicatorSocketCommunication.prototype.destroy = function(){
  this.socket && this.socket.destroy();
  ReplicatorCommunication.call(this);
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
    Timeout.next(function(t){
      if(t.dataRead){
        var eq = JSON.parse(t.dataRead);
        t.dataRead = '';
        Array.prototype.push.apply(t.execQueue,eq);
        //console.log(t.execQueue);
        t.maybeExec();
      }
      t.createUnzip();
      t.processData(t.currentData,t.dataCursor);
    },t);
  });
  this.unzip.on('error',function(){
    console.log('unzip error',arguments);
    process.exit(0);
  });
  //console.log('new unzip created');
};
ReplicatorSocketCommunication.prototype._internalSend = function(buf){
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
  this.originalSize = sqb.length;
  var zip = zlib.createGzip({
    level:9
  });
  var t = this;
  zip.on('data',function(chunk){
    t.sendingBuffs && t.sendingBuffs.push(chunk);
  });
  zip.on('end',function(){
    Timeout.next(function(t){
      if(!t.sendingBuffs){return;}
      var tl = 0;
      for (var i in t.sendingBuffs){
        tl+=t.sendingBuffs[i].length;
      }
      var lb = new Buffer(4);
      lb.writeUInt32LE(tl,0);
      t.sendingBuffs.unshift(lb);
      if(!t.socket){process.exit(0);}
      var b = t.sendingBuffs.shift();
      t.sendingLength = b.length;
      if(t.socket.writable){
        t.socket.write(b);
      }
    },t);
  });
  zip.write(sqb);
  zip.end();
};
ReplicatorSocketCommunication.prototype.sendobj = function(obj){
  if(!this.sendingQueue){return;}
  this.sendingQueue.push(obj);
  this._internalSend();
};
ReplicatorSocketCommunication.prototype.listenTo = function(socket){
  var t = this;
  this.socket = socket;
  this.socket.setNoDelay(true);
  socket.on('error',function(){
    delete t.socket;
  });
  socket.on('data',function(data){
    //console.log(t.__id,'data');
    Timeout.next(function(t){t.processData(data);},t);
  });
  socket.on('drain',function(){
    var now = Timeout.now(), elaps = now - t.start;
    ReplicatorSocketCommunication.sendingTime += elaps;
    ReplicatorSocketCommunication.sentBytes += t.sendingLength;
    ReplicatorSocketCommunication.output -= t.sendingLength;
    //console.log(t.sendingLength/elaps);
    //console.log(t.__id,'drain',t.sendingBuffer.length);
    Timeout.next(function(t){
      if(!t.sendingBuffs){
        return;
      }
      if(!t.sendingBuffs.length){
        t.sending = false;
      }else{
        t.start = this.now;
        var b = t.sendingBuffs.shift();
        t.sendingLength = b.length;
        if(t.socket.writable){
          t.socket.write(b);
        }
      }
      t._internalSend();
    },t);
  });
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
  //this.dataRead+=data.toString('utf8',i,i+canread);
  this.unzip.write(data.slice(i,i+canread));
  this.bytesToRead-=canread;
  i+=canread;
  this.dataCursor = i;
  if(this.bytesToRead===0){
    this.bytesToRead=-1;
    this.lenBufread=0;
    this.unzip.end();
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
    console.log(drp);
    console.log(e.stack);
    console.log(e);
  }
  this.maybeExec();
};
ReplicatorSocketCommunication.prototype.maybeExec = function(){
  if(this.execQueue && this.execQueue.length){
    Timeout.next(function(t){t.exec();},this);
  }
};

module.exports = ReplicatorSocketCommunication;