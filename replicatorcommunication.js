var Timeout = require('herstimeout');

function now(){
  return (new Date()).getTime();
}

var __start = now();
function ReplicatorCommunication(data){
  this.lenBuf = new Buffer(4);
  this.lenBufread = 0;
  this.bytesToRead = -1;
  this.dataRead = '';
  this.data = data;
  this.execQueue = [];
};
ReplicatorCommunication.prototype.send = function(obj){
  var start = now();
  if(!(this.socket && this.socket.writable)){return;}
  var objstr = JSON.stringify(obj);
  if(!objstr){return;}
  var objlen = new Buffer(4);
	var strbuf = new Buffer(objstr, 'utf8');
  objlen.writeUInt32LE(strbuf.length,0);
  try{
    this.socket.write(objlen);
    this.socket.write(objstr);
  }
  catch(e){
    //socket closed...
  }
  ReplicatorCommunication.sendingTime += (now() - start);
};
ReplicatorCommunication.prototype.listenTo = function(socket){
  var t = this;
  this.socket = socket;
  socket.on('data',function(data){
    t.processData(data);
  });
};
ReplicatorCommunication.prototype.processData = function(data,offset){
  if(!this.socket){return;}
  var _rcvstart = now();
  var i=(offset||0);
  //console.log('data',data.length,'long, reading from',i);
  for(; (this.bytesToRead<0)&&(i<data.length)&&(this.lenBufread<4); i++,this.lenBufread++){
    this.lenBuf[this.lenBufread] = data[i];
    //console.log(this.lenBuf);
  }
  if(this.bytesToRead<0){
    if(this.lenBufread!==4){
      ReplicatorCommunication.rcvingTime += (now()-_rcvstart);
      return;
    }
    this.bytesToRead = this.lenBuf.readUInt32LE(0);
  }
  //console.log('should read',this.bytesToRead,'bytes');
  var canread = (data.length-i);
  if(canread>this.bytesToRead){
    canread=this.bytesToRead;
  }
  this.dataRead+=data.toString('utf8',i,i+canread);
  this.bytesToRead-=canread;
  i+=canread;
  if(this.bytesToRead===0){
    this.bytesToRead=-1;
    this.lenBufread=0;
    if(this.socket){
      this.execQueue.push(this.dataRead);
      ReplicatorCommunication.input+=this.dataRead.length;
      this.dataRead = '';
      //console.log('ql <',this.execQueue.length);
      this.maybeExec();
      ReplicatorCommunication.rcvingTime += (now()-_rcvstart);
      this.processData(data,i);
      return;
    }
  }
  ReplicatorCommunication.rcvingTime += (now()-_rcvstart);
};
ReplicatorCommunication.prototype.exec = function(){
  try{
    var dr = this.execQueue.shift();
    if(!dr){return;}
    var drp = JSON.parse(dr);
    //console.log('ql >',this.execQueue.length);
    if(drp){
			console.log('executing',drp);
      var es = now();
      this.data.processInput(this,drp);
      ReplicatorCommunication.execTime += (now()-es);
      ReplicatorCommunication.input-=dr.length;
    }
  }catch(e){
    //console.log('ERROR processing input', util.inspect(drp,false,null,false));
    console.log(dr);
    console.log(e.stack);
    console.log(e);
  }
  this.maybeExec();
};
ReplicatorCommunication.prototype.maybeExec = function(){
  if(this.execQueue && this.execQueue.length){
    Timeout.set(function(t){
      t.exec();
    },0,this);
  }
};
ReplicatorCommunication.metrics = function(){
  var _n = now(), elaps = _n-__start,st=ReplicatorCommunication.sendingTime,rt=ReplicatorCommunication.rcvingTime,et=ReplicatorCommunication.execTime;
  __start = _n;
  ReplicatorCommunication.sendingTime=0;
  ReplicatorCommunication.rcvingTime=0;
  ReplicatorCommunication.execTime=0;
  return {bufferedInput:ReplicatorCommunication.input,rcvingUtilization:~~(rt*100/elaps),sendingUtilization:~~(st*100/elaps),execUtilization:~~(et*100/elaps)};
};
ReplicatorCommunication.input = 0;
ReplicatorCommunication.rcvingTime = 0;
ReplicatorCommunication.sendingTime = 0;
ReplicatorCommunication.execTime = 0;


module.exports = ReplicatorCommunication;
