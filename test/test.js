var DataMaster = require('../datamaster.js');


var a = new DataMaster.Scalar('bla', 'truc', 'bbb');
a.print_debug();
a.alter('bla', 'truc', 'bb1');
a.print_debug();
console.log(a.value('bb'));
console.log(a.value('bb1'));
