var BigCounter = require('./BigCounter');

var errors = {
  OK:{message:'OK'},
  NO_ITEM_TO_ADD:{message:'No item to add'}
};

function add(item,cb){
  if(!item){
    cb('NO_ITEM_TO_ADD');
    return;
  }
  this.self.count++;
  var idname = this.self.idname || id;
  var id = item[idname];
  if(typeof id === 'undefined'){
    if(!this.self.counter){
      this.self.counter = new BigCounter();
    }
    this.self.counter.inc();
    id = this.self.counter.toSortableString();
  }else{
    delete item[idname];
  }
  var actions = [];
  if(this.self.count>=this.self.size){
    var t = this;
    this.data.traverseElements(function(name){
      actions.push(['remove',[name]]);
      t.self.count--;
      if(t.self.count<t.self.size){
        return true;
      }
    });
  }
  actions.push(['set',[id]]);
  for(var i in item){
    var d = item[i], tod = typeof d;
    if(!(tod==='number'||tod==='string')){
      d = JSON.stringify(d);
    }
    actions.push(['set',[id,i],[d]]);
  }
  this.data.commit('new_fifo_item',actions);
  cb('OK');
};
add.params = 'originalobj';

function init(){
  var self = this.self;
  self.count = 0;
  this.data.traverseElements(function(){
    self.count++;
  });
  var overflow = self.count-self.size;
  if(overflow>0){
    var actions = [];
    this.data.traverseElements(function(name){
      actions.push(['remove',[name]]);
      overflow--;
      if(overflow<1){
        return true;
      }
    });
    this.data.commit(actions);
  }
};


module.exports = {
  errors:errors,
  init:init,
  add:add
};
