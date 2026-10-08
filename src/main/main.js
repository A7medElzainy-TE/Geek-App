const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const Database = require('./database');
const Secrets = require('./secrets');
const SyncService = require('./sync');
const { readLocalLicense, activateLicense, machineHash, SUPABASE_URL, SUPABASE_KEY } = require('./license');

let win, db, secrets, sync;
const smokeTest=process.argv.includes('--smoke-test');
app.disableHardwareAcceleration();

function startupLogPath(){
  try{
    const root=app.isReady()?app.getPath('userData'):(process.env.TEMP||process.cwd());
    return path.join(root,'geek-pos-startup.log');
  }catch(_){return path.join(process.cwd(),'geek-pos-startup.log')}
}
function writeStartupLog(error){
  const text=[
    'Geek POS startup failure',
    'Time: '+new Date().toISOString(),
    'Version: '+app.getVersion(),
    'Platform: '+process.platform+' '+process.arch,
    'Packaged: '+app.isPackaged,
    'Resources: '+process.resourcesPath,
    '',
    error?.stack||String(error)
  ].join('\r\n');
  try{
    const p=startupLogPath();
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.writeFileSync(p,text,'utf8');
    return p;
  }catch(_){return ''}
}

function createWindow(){
  win=new BrowserWindow({
    width:1500,height:920,minWidth:1180,minHeight:720,show:true,
    backgroundColor:'#07152f',
    icon:path.join(__dirname,'../renderer/logo.jpg'),
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}
  });
  win.setMenuBarVisibility(false);
  const page=path.join(__dirname,'../renderer/index.html');
  win.loadFile(page).catch(err=>{
    const log=writeStartupLog(err);
    dialog.showErrorBox('Geek POS - خطأ تحميل الواجهة',`تعذر تحميل واجهة البرنامج.\n\n${err.message||err}\n\nملف التشخيص: ${log}`);
  });
  win.webContents.on('render-process-gone',(_,details)=>{
    const err=new Error(`Renderer process stopped: ${details.reason} (exit ${details.exitCode})`);
    writeStartupLog(err);
  });
}

async function printHtml(html,printerName){
  const w=new BrowserWindow({show:false,webPreferences:{sandbox:false}});
  await w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  const printers=await w.webContents.getPrintersAsync();
  let deviceName=printerName||'';
  if(deviceName&&!printers.some(p=>p.name===deviceName))deviceName='';
  return new Promise(resolve=>w.webContents.print(
    {silent:Boolean(deviceName),deviceName,printBackground:true,margins:{marginType:'none'}},
    (ok,reason)=>{w.close();resolve({success:ok,message:reason||''})}
  ));
}

app.whenReady().then(async()=>{
  try{
    db=await new Database(app.getPath('userData')).init();
    secrets=new Secrets(app.getPath('userData'));
    sync=new SyncService(db,secrets);

    if(smokeTest){
      db.scalar('SELECT COUNT(*) FROM categories');
      db.scalar('SELECT COUNT(*) FROM dining_tables');
      db.scalar('SELECT COUNT(*) FROM payment_methods');
      console.log('GEEK_POS_SMOKE_OK');
      app.exit(0);
      return;
    }

    createWindow();
    setInterval(()=>{if(readLocalLicense())sync.syncNow().catch(()=>{})},120000);
  }catch(err){
    const log=writeStartupLog(err);
    console.error(err);
    dialog.showErrorBox(
      'Geek POS - تعذر بدء التشغيل',
      `حدث خطأ أثناء تشغيل Geek POS.\n\n${err.message||err}\n\nتم حفظ ملف تشخيص هنا:\n${log}`
    );
    app.exit(1);
  }
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

ipcMain.handle('app:bootstrap',()=>({
  version:app.getVersion(),licensed:Boolean(readLocalLicense()),license:readLocalLicense(),
  machineHash:machineHash(),hasUsers:db.hasUsers(),settings:db.getSettings(),
  supabaseDefault:{url:SUPABASE_URL,key:SUPABASE_KEY}
}));
ipcMain.handle('license:activate',(_,key)=>activateLicense(key,app.getVersion()));

ipcMain.handle('auth:create-first',(_,data)=>{
  if(db.hasUsers())throw new Error('تم إنشاء المستخدم الأول مسبقاً');
  return db.createUser({...data,role:'admin'});
});
ipcMain.handle('auth:login',(_,u,p)=>db.login(u,p));

ipcMain.handle('users:list',()=>db.rows('SELECT id,name,username,role,permissions_json,active,created_at FROM users ORDER BY name'));
ipcMain.handle('users:create',(_,data)=>db.createUser(data));
ipcMain.handle('users:update',(_,id,data)=>db.updateUser(id,data));

ipcMain.handle('data:categories',(_,all=false)=>db.listCategories(Boolean(all)));
ipcMain.handle('data:products',(_,all=false)=>db.listProducts(Boolean(all)));
ipcMain.handle('data:save-category',(_,d)=>db.upsertCategory(d));
ipcMain.handle('data:remove-category',(_,id)=>db.removeCategory(id));
ipcMain.handle('data:save-product',(_,d)=>db.upsertProduct(d));
ipcMain.handle('data:remove-product',(_,id)=>db.removeProduct(id));

ipcMain.handle('customer:find-mobile',(_,m)=>{const c=db.findCustomer(m);return c?db.getCustomer(c.id):null});
ipcMain.handle('customer:list',(_,q)=>db.listCustomers(q));
ipcMain.handle('customer:get',(_,id)=>db.getCustomer(id));
ipcMain.handle('customer:save',(_,d)=>db.saveCustomer(d));

ipcMain.handle('drivers:list',(_,all=false)=>db.listDrivers(Boolean(all)));
ipcMain.handle('drivers:save',(_,d)=>db.saveDriver(d));
ipcMain.handle('drivers:remove',(_,id)=>db.removeDriver(id));

ipcMain.handle('tables:list',(_,all=false)=>db.listDiningTables(Boolean(all)));
ipcMain.handle('tables:save',(_,d)=>db.saveDiningTable(d));
ipcMain.handle('tables:remove',(_,id)=>db.removeDiningTable(id));
ipcMain.handle('tables:order',(_,id)=>db.currentTableOrder(id));

ipcMain.handle('payments:list',(_,all=false)=>db.listPaymentMethods(Boolean(all)));
ipcMain.handle('payments:save',(_,d)=>db.savePaymentMethod(d));
ipcMain.handle('payments:remove',(_,id)=>db.removePaymentMethod(id));

ipcMain.handle('orders:create',(_,d)=>db.createOrder(d));
ipcMain.handle('orders:save',(_,id,d)=>db.saveOrder(id,d));
ipcMain.handle('orders:list',(_,type)=>db.listOrders(type));
ipcMain.handle('orders:get',(_,id)=>db.getOrder(id));
ipcMain.handle('orders:status',(_,id,status,extra)=>db.updateOrderStatus(id,status,extra));

ipcMain.handle('shift:current',(_,uid)=>db.currentShift(uid));
ipcMain.handle('shift:open',(_,uid,cash)=>db.openShift(uid,cash));
ipcMain.handle('shift:close',(_,id,cash,notes)=>db.closeShift(id,cash,notes));
ipcMain.handle('expense:add',(_,d)=>db.addExpense(d));

ipcMain.handle('dashboard:get',()=>db.dashboard());
ipcMain.handle('settings:get',()=>({...db.getSettings(),supabase_password:Boolean(secrets.get('supabase_password'))}));
ipcMain.handle('settings:save',(_,data)=>{
  const c={...data};
  if(Object.prototype.hasOwnProperty.call(c,'supabase_password')){
    secrets.set('supabase_password',c.supabase_password);
    delete c.supabase_password;
  }
  db.setSettings(c);
  return true;
});

ipcMain.handle('sync:now',()=>sync.syncNow());
ipcMain.handle('printer:list',async()=>win.webContents.getPrintersAsync());
ipcMain.handle('printer:print-html',(_,html,name)=>printHtml(html,name));

ipcMain.handle('export:customers',async()=>{
  const rows=db.listCustomers('');
  const data=rows.map(r=>({
    'اسم العميل':r.name,'رقم الموبايل':r.mobile,'العنوان':r.address||'','المنطقة':r.area||'',
    'عدد الطلبات':Number(r.order_count||0),'إجمالي المشتريات':Number(r.total_spent||0),'آخر طلب':r.last_order||''
  }));
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb,ws,'العملاء');
  const {filePath,canceled}=await dialog.showSaveDialog(win,{
    title:'تصدير العملاء',
    defaultPath:`عملاء-Geek-POS-${new Date().toISOString().slice(0,10)}.xlsx`,
    filters:[{name:'Excel',extensions:['xlsx']}]
  });
  if(canceled||!filePath)return{success:false};
  XLSX.writeFile(wb,filePath);
  return{success:true,filePath};
});
