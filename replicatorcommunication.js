function ReplicatorCommunication(data){
  this.lenBuf = new Buffer(4);
  this.lenBufread = 0;
  this.bytesToRead = -1;
  this.dataRead = '';
  this.data = data;
};
ReplicatorCommunication.prototype.send = function(obj){
  if(!(this.socket && this.socket.writable)){return;}
  var objstr = JSON.stringify(obj)||'';
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
  var i=(offset||0);
  //console.log('data',data.length,'long, reading from',i);
  for(; (this.bytesToRead<0)&&(i<data.length)&&(this.lenBufread<4); i++,this.lenBufread++){
    this.lenBuf[this.lenBufread] = data[i];
    //console.log(this.lenBuf);
  }
  if(this.bytesToRead<0){
    if(this.lenBufread!==4){
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
      try{
        var dr = this.dataRead;
        this.dataRead = '';
        var drp = JSON.parse(dr);
        dr = null;
        this.data.processInput(this,drp);
      }catch(e){
				console.log('ERROR processing input', this.dataRead);
        console.log(e.stack);
        console.log(e);
      }
    }
    if(this.socket){
      this.processData(data,i);
    }
  }
};


module.exports = ReplicatorCommunication;
