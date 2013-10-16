function ReplicatorCommunication(inputcb){
  this.lenBuf = new Buffer(4);
  this.lenBufread = 0;
  this.bytesToRead = -1;
  this.dataRead = '';
  this.inputcb = inputcb || function(){};
};
ReplicatorCommunication.prototype.tell = function(obj){
  if(!this.socket){return;}
  var objstr = JSON.stringify(obj);
  var objlen = new Buffer(4);
  objlen.writeUInt32LE(objstr.length,0);
  this.socket.write(objlen);
  this.socket.write(objstr);
};
ReplicatorCommunication.prototype.listenTo = function(socket){
  var t = this;
  this.socket = socket;
  socket.on('data',function(data){
    t.processData(data);
  });
  socket.on('close',function(){
    t.lenBufread=0;
    t.bytesToRead=-1;
    t.dataRead='';
    delete t.socket;
  });
};
ReplicatorCommunication.prototype.processData = function(data,offset){
  if(!this.socket){return;}
  var i=(offset||0);
  console.log('data',data.length,'long, reading from',i);
  for(; (this.bytesToRead<0)&&(i<data.length)&&(this.lenBufread<4); i++,this.lenBufread++){
    this.lenBuf[this.lenBufread] = data[i];
    console.log(this.lenBuf);
  }
  if(this.bytesToRead<0){
    if(this.lenBufread!==4){
      return;
    }
    this.bytesToRead = this.lenBuf.readUInt32LE(0);
  }
  console.log('should read',this.bytesToRead,'bytes');
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
      try{
        this.dataRead = JSON.parse(this.dataRead,function(k,v){if(!isNaN(parseInt(k))&&v===null){return undefined;}return v;});
        this.inputcb(this.dataRead);
      }catch(e){}
    }
    this.dataRead = '';
    if(this.socket){
      this.processData(data,i);
    }
  }
};


module.exports = ReplicatorCommunication;
