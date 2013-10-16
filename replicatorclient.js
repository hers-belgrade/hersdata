var net = require('net');

function ReplicatorClient(dataelement){
  this.data = dataelement;
  this.lenBuf = new Buffer(4);
  this.lenBufread = 0;
  this.bytesToRead = -1;
  this.dataRead = '';
};
ReplicatorClient.prototype.go = function(url){
  var t = this;
  net.createConnection(url.port,url.address,function(){
    t.client = this;
    this.on('data',function(data){
      t.processData(data);
    });
    //console.log('connection',this);
  }).on('error',function(){var _t = t, _url=url; setTimeout(function(){_t.go(_url);},1000)});
};
ReplicatorClient.prototype.do_command = function(command,paramobj,cb){
};
ReplicatorClient.prototype.processData = function(data,offset){
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
    this.processInput(this.dataRead);
    this.dataRead = '';
    this.processData(data,i);
  }
};
ReplicatorClient.prototype.processInput = function(input){
  this.dataRead = JSON.parse(this.dataRead,function(k,v){if(!isNaN(parseInt(k))&&v===null){return undefined;}return v;});
  var dcp = this.dataRead.dcp;
  if(dcp){
    this.data.commit(dcp[0],dcp[1]);
  }
};

module.exports = ReplicatorClient;
