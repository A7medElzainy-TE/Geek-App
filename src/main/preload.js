const { contextBridge, ipcRenderer } = require('electron');
const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args);

contextBridge.exposeInMainWorld('geek',{
  bootstrap:()=>invoke('app:bootstrap'),
  activate:k=>invoke('license:activate',k),
  createFirstUser:d=>invoke('auth:create-first',d),
  login:(u,p)=>invoke('auth:login',u,p),

  users:{
    list:()=>invoke('users:list'),
    create:d=>invoke('users:create',d),
    update:(id,d)=>invoke('users:update',id,d)
  },

  categories:(all=false)=>invoke('data:categories',all),
  products:(all=false)=>invoke('data:products',all),
  saveCategory:d=>invoke('data:save-category',d),
  removeCategory:id=>invoke('data:remove-category',id),
  saveProduct:d=>invoke('data:save-product',d),
  removeProduct:id=>invoke('data:remove-product',id),

  customers:{
    find:m=>invoke('customer:find-mobile',m),
    list:q=>invoke('customer:list',q),
    get:id=>invoke('customer:get',id),
    save:d=>invoke('customer:save',d),
    export:()=>invoke('export:customers')
  },

  drivers:{
    list:(all=false)=>invoke('drivers:list',all),
    save:d=>invoke('drivers:save',d),
    remove:id=>invoke('drivers:remove',id)
  },

  tables:{
    list:(all=false)=>invoke('tables:list',all),
    save:d=>invoke('tables:save',d),
    remove:id=>invoke('tables:remove',id),
    order:id=>invoke('tables:order',id)
  },

  payments:{
    list:(all=false)=>invoke('payments:list',all),
    save:d=>invoke('payments:save',d),
    remove:id=>invoke('payments:remove',id)
  },

  orders:{
    create:d=>invoke('orders:create',d),
    save:(id,d)=>invoke('orders:save',id,d),
    list:t=>invoke('orders:list',t),
    get:id=>invoke('orders:get',id),
    status:(id,s,e={})=>invoke('orders:status',id,s,e)
  },

  shifts:{
    current:u=>invoke('shift:current',u),
    open:(u,c)=>invoke('shift:open',u,c),
    close:(id,c,n)=>invoke('shift:close',id,c,n)
  },

  expenses:{add:d=>invoke('expense:add',d)},
  dashboard:()=>invoke('dashboard:get'),
  settings:{get:()=>invoke('settings:get'),save:d=>invoke('settings:save',d)},
  sync:()=>invoke('sync:now'),
  printers:{
    list:()=>invoke('printer:list'),
    routes:(all=false)=>invoke('printer:routes',all),
    saveRoute:d=>invoke('printer:save-route',d),
    removeRoute:id=>invoke('printer:remove-route',id),
    print:(html,name)=>invoke('printer:print-html',html,name),
    route:(orderId,stage)=>invoke('printer:route-order',orderId,stage),
    preview:(kind,orderId=null)=>invoke('printer:preview',kind,orderId)
  }
});
