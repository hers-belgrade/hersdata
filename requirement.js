var errors = {
  'INTERNAL_ERROR':{message:'An internal error has occured: [error]. Please contact the software vendor'},
  'BID_REFUSED':{message:'Your bid has been refused [reason]',params:['reason']},
  'DO_OFFER':{message:'Give your final offer, your receipt is [receipt]',params:['receipt']},
  'ACCEPTED':{message:'Your bid [bid] has been accepted',params:['bid']}
};


function init(){
  this.self.counter = 0;
};

function bid(paramobj,cb){
  if(this.self.cbs.onBid){
    var self = this.self;
    this.self.cbs.onBid(paramobj,function(code,bidresolveobj){
      switch(code){
      case 'DO_OFFER':
        self.counter++;
        cb('DO_OFFER',RandomBytes(8).toString('hex')+self.counter,bidresolveobj.offer);
        break;
      case 'ACCEPTED':
        cb('ACCEPTED',bidresolveobj.accept);
        this.notifyDone();
        break;
      case 'BID_REFUSED':
        cb('BID_REFUSED',bidresolveobj.reason);
        break;
      }
    });
  }
};
bid.params = 'originalobj';

function confirm(paramobj,cb){
};
confirm.params = 'originalobj';

module.exports = {
  errors:errors,
  init:init,
  bid:bid
};
