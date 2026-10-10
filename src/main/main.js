const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const QRCode = require('qrcode');
const Database = require('./database');
const Secrets = require('./secrets');
const SyncService = require('./sync');
const { readLocalLicense, activateLicense, machineHash, SUPABASE_URL, SUPABASE_KEY } = require('./license');

let win, db, secrets, sync;
const smokeTest=process.env.GEEK_POS_SMOKE_TEST==='1'||process.argv.includes('--smoke-test');
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
  const deviceName=printerName||'';
  if(deviceName&&!printers.some(p=>p.name===deviceName)){w.close();return{success:false,message:'الطابعة المحددة غير متاحة على Windows'}}
  return new Promise(resolve=>w.webContents.print(
    {silent:Boolean(deviceName),deviceName,printBackground:true,margins:{marginType:'none'}},
    (ok,reason)=>{w.close();resolve({success:ok,message:reason||''})}
  ));
}

const pEsc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pNum=v=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const pMoney=v=>pNum(v)+' ج.م';
const orderTypeAr=t=>({takeaway:'تيك أواي',dinein:'صالة',delivery:'دليفري'}[t]||t||'');

function orderPrintData(orderId){
  const o=db.getOrder(orderId);if(!o)throw new Error('الطلب غير موجود');
  o.cashier_name=o.user_id?db.scalar('SELECT name FROM users WHERE id=?',[o.user_id])||'':'';
  o.items=db.rows(`SELECT oi.*,p.category_id,c.name category_name,c.printer_route_id
    FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id
    WHERE oi.order_id=? ORDER BY oi.created_at`,[orderId]);
  return o;
}
function ticketCss(width=80,kind='prep'){
  if(kind==='receipt')return `<style>@page{size:${Number(width)||80}mm auto;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font-family:Tahoma,Arial,sans-serif;direction:rtl}.receipt{width:100%;padding:3.2mm 3mm;font-size:10.5px}.r-center{text-align:center}.r-logo{width:36px;height:36px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 3px}.r-name{font-size:14px;font-weight:700;margin:1px 0}.r-small{font-size:9.5px;line-height:1.45}.r-welcome{margin:4px 0 7px}.dash{border-top:1px dashed #555;margin:5px 0}.r-meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;font-size:9.5px}.r-meta span:nth-child(even){text-align:left}.r-table{width:100%;border-collapse:collapse;margin-top:3px}.r-table th{font-size:9.5px;border-top:1px dashed #555;border-bottom:1px solid #333;padding:3px 0;text-align:right}.r-table th:nth-child(2),.r-table td:nth-child(2){text-align:center;width:36px}.r-table th:last-child,.r-table td:last-child{text-align:left;width:62px}.r-table td{padding:3px 0;vertical-align:top;font-size:10px}.r-note{font-size:8.8px;font-weight:700;padding:0 2px 3px}.r-totals{border-top:1px dashed #555;margin-top:3px;padding-top:3px}.r-total-line{display:flex;justify-content:space-between;padding:1px 0}.r-grand{border-top:1px solid #222;border-bottom:1px dashed #555;margin-top:3px;padding:5px 0;font-size:15px;font-weight:800}.r-paid{display:flex;justify-content:space-between;padding:3px 0 1px}.r-footer{font-size:9px;margin-top:5px}.qr{width:74px;height:74px;display:block;margin:5px auto 0}</style>`;
  return `<style>@page{size:${Number(width)||80}mm auto;margin:0}*{box-sizing:border-box}body{margin:0;padding:4mm 3mm;font-family:Tahoma,Arial,sans-serif;color:#000;background:#fff;font-size:12px;direction:rtl}.ticket{width:100%}.center{text-align:center}.title{font-size:20px;font-weight:800;margin:2px 0}.sub{font-size:11px}.line{border-top:1px dashed #000;margin:7px 0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px}.meta b{font-size:13px}.items{width:100%;border-collapse:collapse}.items th,.items td{padding:5px 2px;border-bottom:1px dotted #999;text-align:right}.items th:last-child,.items td:last-child{text-align:left}.qty{font-size:16px;font-weight:800}.item-note{font-size:11px;font-weight:800;margin-top:3px}.note{border:1px solid #000;padding:6px;margin-top:7px;font-weight:700}.route{font-size:13px;font-weight:800;border-bottom:2px solid #000;padding:0 0 6px;margin:0 0 7px;text-align:center}</style>`;
}
async function ticketHtml(kind,o,items,width=80,routeName=''){
  const s=db.getSettings(),business=pEsc(s.business_name||'Geek POS');
  const dt=new Date(o.created_at||Date.now()),date=dt.toLocaleDateString('en-GB'),time=dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  if(kind==='receipt'){
    const logoPath=path.join(__dirname,'../renderer/logo.jpg');
    const logoData=fs.existsSync(logoPath)?'data:image/jpeg;base64,'+fs.readFileSync(logoPath).toString('base64'):'';
    const qr=await QRCode.toDataURL(`Geek POS | Invoice ${o.order_no} | ${pNum(o.total)} EGP`,{margin:0,width:180,errorCorrectionLevel:'M'});
    const rows=(items||[]).map(i=>`<tr><td>${pEsc(i.product_name)}${i.notes?`<div class="r-note">• ${pEsc(i.notes)}</div>`:''}</td><td>${Number(i.qty)}</td><td>${pNum(i.total||Number(i.qty)*Number(i.unit_price))}</td></tr>`).join('');
    const extra=[];
    if(Number(o.discount||0)>0)extra.push(`<div class="r-total-line"><span>الخصم</span><span>${pMoney(o.discount)}</span></div>`);
    if(Number(o.delivery_fee||0)>0)extra.push(`<div class="r-total-line"><span>التوصيل</span><span>${pMoney(o.delivery_fee)}</span></div>`);
    return `<!doctype html><html dir="rtl"><head><meta charset="utf-8">${ticketCss(width,'receipt')}</head><body><div class="receipt">
      <div class="r-center">${logoData?`<img class="r-logo" src="${logoData}">`:``}<div class="r-name">${business}</div><div class="r-small">${pEsc(s.business_address||'')}</div><div class="r-small" dir="ltr">${pEsc(s.business_phone||'')}</div><div class="r-welcome">أهلاً بكم</div></div>
      <div class="dash"></div>
      <div class="r-meta"><span>فاتورة #${o.order_no}</span><span>${date} ${time}</span><span>النوع: ${orderTypeAr(o.order_type)}</span><span>${o.table_name?'طاولة: '+pEsc(o.table_name):''}</span><span>الكاشير: ${pEsc(o.cashier_name||'')}</span><span></span></div>
      <table class="r-table"><thead><tr><th>الصنف</th><th>كمية</th><th>القيمة</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="r-totals"><div class="r-total-line"><span>المجموع</span><span>${pMoney(o.subtotal)}</span></div>${extra.join('')}</div>
      <div class="r-total-line r-grand"><span>الإجمالي</span><span>${pMoney(o.total)}</span></div>
      <div class="r-paid"><span>نقدي</span><span>${pMoney(o.paid||o.total)}</span></div>
      <div class="dash"></div><div class="r-center r-footer">${pEsc(s.receipt_footer||'شكراً لزيارتكم — نتشرف بخدمتكم')}</div><img class="qr" src="${qr}">
    </div></body></html>`;
  }
  const head=`<div class="center"><div class="title">${business}</div></div><div class="line"></div><div class="meta"><b>طلب #${o.order_no}</b><b>${orderTypeAr(o.order_type)}</b><span>${date} ${time}</span><span>${o.table_name?'طاولة: '+pEsc(o.table_name):o.customer_name?'العميل: '+pEsc(o.customer_name):''}</span></div>`;
  const rows=(items||[]).map(i=>`<tr><td><span class="qty">${Number(i.qty)}×</span> ${pEsc(i.product_name)}${i.notes?`<div class="item-note">ملاحظة الصنف: ${pEsc(i.notes)}</div>`:''}</td><td>${pEsc(i.category_name||'')}</td></tr>`).join('');
  const route=routeName?`<div class="route">${pEsc(routeName)}</div>`:'';
  const notes=o.notes?`<div class="note">ملاحظات الطلب: ${pEsc(o.notes)}</div>`:'';
  const tail=`<div class="center" style="font-weight:800;margin-top:8px">${kind==='prep'?'بون تحضير':'بون تجميع'}</div>`;
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8">${ticketCss(width,kind)}</head><body><div class="ticket">${route}${head}<div class="line"></div><table class="items"><thead><tr><th>الصنف</th><th>القسم</th></tr></thead><tbody>${rows}</tbody></table>${notes}${tail}</div></body></html>`;
}
function routeMatches(route,o){
  const types=route.order_types||[];return !types.length||types.includes(o.order_type);
}
async function routeOrderPrint(orderId,stage='closed'){
  const o=orderPrintData(orderId),routes=db.listPrinterRoutes(false),results=[];
  const jobs=[];
  const printPrep=['open','kitchen','closed'].includes(stage);
  const printAssembly=['kitchen','closed','final'].includes(stage);
  const printReceipt=['closed','final','receipt'].includes(stage);
  if(printPrep){
    for(const r of routes.filter(x=>x.route_type==='prep')){
      const its=o.items.filter(i=>i.printer_route_id===r.id);
      if(its.length)jobs.push({r,kind:'prep',items:its});
    }
  }
  if(printAssembly){
    for(const r of routes.filter(x=>x.route_type==='assembly'&&routeMatches(x,o))){
      const ids=r.category_ids||[],its=ids.length?o.items.filter(i=>ids.includes(i.category_id)):o.items;
      if(its.length)jobs.push({r,kind:'assembly',items:its});
    }
  }
  if(printReceipt){
    for(const r of routes.filter(x=>x.route_type==='receipt'&&routeMatches(x,o))){
      const ids=r.category_ids||[],its=ids.length?o.items.filter(i=>ids.includes(i.category_id)):o.items;
      if(its.length)jobs.push({r,kind:'receipt',items:its});
    }
  }
  for(const j of jobs){
    for(let copy=0;copy<Math.max(1,Number(j.r.copies||1));copy++){
      const html=await ticketHtml(j.kind,o,j.items,j.r.paper_width,j.r.name);
      const out=await printHtml(html,j.r.printer_name);
      results.push({route_id:j.r.id,route_name:j.r.name,kind:j.kind,...out});
    }
  }
  return{success:results.every(x=>x.success),count:results.length,results};
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
      process.exit(0);
    }

    createWindow();
    setInterval(()=>{if(readLocalLicense())sync.syncNow().catch(()=>{})},120000);
  }catch(err){
    const log=writeStartupLog(err);
    console.error(err);
    if(smokeTest){process.exit(1)}
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
ipcMain.handle('printer:routes',(_,all=false)=>db.listPrinterRoutes(Boolean(all)));
ipcMain.handle('printer:save-route',(_,d)=>db.savePrinterRoute(d));
ipcMain.handle('printer:remove-route',(_,id)=>db.removePrinterRoute(id));
ipcMain.handle('printer:print-html',(_,html,name)=>printHtml(html,name));
ipcMain.handle('printer:route-order',(_,orderId,stage)=>routeOrderPrint(orderId,stage));
ipcMain.handle('printer:preview',async(_,kind,orderId)=>{
  const o=orderId?orderPrintData(orderId):{order_no:125,order_type:'takeaway',total:150,created_at:new Date().toISOString(),items:[
    {product_name:'صنف تجريبي',qty:1,unit_price:100,total:100,category_name:'قسم 1',notes:''},
    {product_name:'صنف إضافي',qty:1,unit_price:50,total:50,category_name:'قسم 2',notes:'بدون إضافات'}
  ]};
  return await ticketHtml(kind,o,o.items,80,kind==='prep'?'التحضير':kind==='assembly'?'تجميع تيك أواي':'');
});

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
