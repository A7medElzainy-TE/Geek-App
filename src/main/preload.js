const { contextBridge, ipcRenderer } = require('electron');
const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args);
contextBridge.exposeInMainWorld('geek',{
  bootstrap:()=>invoke('app:bootstrap'),
  activate:k=>invoke('license:activate',k),
  createFirstUser:d=>invoke('auth:create-first',d),
  login:(u,p)=>invoke('auth:login',u,p),
  users:{list:()=>invoke('users:list'),create:d=>invoke('users:create',d)},
  categories:()=>invoke('data:categories'),
  products:()=>invoke('data:products'),
  saveCategory:d=>invoke('data:save-category',d),
  saveProduct:d=>invoke('data:save-product',d),
  customers:{find:m=>invoke('customer:find-mobile',m),list:q=>invoke('customer:list',q),get:id=>invoke('customer:get',id),save:d=>invoke('customer:save',d),export:()=>invoke('export:customers')},
  drivers:{list:()=>invoke('drivers:list'),save:d=>invoke('drivers:save',d)},
  orders:{create:d=>invoke('orders:create',d),list:t=>invoke('orders:list',t),get:id=>invoke('orders:get',id),status:(id,s,e)=>invoke('orders:status',id,s,e)},
  shifts:{current:u=>invoke('shift:current',u),open:(u,c)=>invoke('shift:open',u,c),close:(id,c,n)=>invoke('shift:close',id,c,n)},
  expenses:{add:d=>invoke('expense:add',d)},
  dashboard:()=>invoke('dashboard:get'),
  settings:{get:()=>invoke('settings:get'),save:d=>invoke('settings:save',d)},
  sync:()=>invoke('sync:now'),
  printers:{list:()=>invoke('printer:list'),print:(h,n)=>invoke('printer:print-html',h,n)}
});
