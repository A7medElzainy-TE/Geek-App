const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

class Database {
  constructor(userDataPath) {
    this.file = path.join(userDataPath, 'geek-pos.sqlite');
    this.db = null;
  }

  async init() {
    const wasmPath = process.resourcesPath
      ? path.join(process.resourcesPath, 'sql-wasm.wasm')
      : path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const bytes = fs.existsSync(this.file) ? fs.readFileSync(this.file) : null;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON;');
    this.migrate();
    this.persist();
    return this;
  }

  migrate() {
    this.db.run(\`
      CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT NOT NULL,
        permissions_json TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1,
        must_change_password INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL);

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT DEFAULT 'pending'
      );
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, category_id TEXT, sku TEXT, barcode TEXT, name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0, cost REAL DEFAULT 0, tax_rate REAL DEFAULT 0,
        active INTEGER DEFAULT 1, kitchen_printer TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'pending', FOREIGN KEY(category_id) REFERENCES categories(id)
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, mobile TEXT UNIQUE NOT NULL, notes TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT DEFAULT 'pending'
      );
      CREATE TABLE IF NOT EXISTS customer_addresses (
        id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, label TEXT, address TEXT NOT NULL, area TEXT,
        is_default INTEGER DEFAULT 0, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'pending', FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, mobile TEXT, active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS dining_tables (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT, seats INTEGER DEFAULT 4, sort_order INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT DEFAULT 'pending'
      );
      CREATE TABLE IF NOT EXISTS payment_methods (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, opened_at TEXT NOT NULL, opening_cash REAL DEFAULT 0,
        closed_at TEXT, closing_cash REAL, status TEXT NOT NULL DEFAULT 'open', notes TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT DEFAULT 'pending'
      );
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, order_no INTEGER NOT NULL, order_type TEXT NOT NULL,
        customer_id TEXT, address_id TEXT, driver_id TEXT, table_id TEXT, shift_id TEXT, user_id TEXT,
        status TEXT NOT NULL DEFAULT 'new', subtotal REAL DEFAULT 0, discount REAL DEFAULT 0,
        delivery_fee REAL DEFAULT 0, total REAL DEFAULT 0, paid REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'cash', notes TEXT, kitchen_sent_at TEXT, driver_loaded_at TEXT,
        settled_at TEXT, returned_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'pending'
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT, product_name TEXT NOT NULL,
        qty REAL NOT NULL, unit_price REAL NOT NULL, total REAL NOT NULL, notes TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT DEFAULT 'pending',
        FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY, shift_id TEXT, title TEXT NOT NULL, amount REAL NOT NULL, notes TEXT,
        user_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT DEFAULT 'pending'
      );
      CREATE TABLE IF NOT EXISTS returns (
        id TEXT PRIMARY KEY, order_id TEXT, amount REAL NOT NULL, reason TEXT, user_id TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT DEFAULT 'pending'
      );
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
        operation TEXT NOT NULL DEFAULT 'upsert', created_at TEXT NOT NULL, attempts INTEGER DEFAULT 0,
        last_error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
    \`);

    this.ensureColumn('orders','table_id','TEXT');
    this.seedDefaults();
  }

  ensureColumn(table, column, type) {
    const exists = this.rows(\`PRAGMA table_info(\${table})\`).some(x => x.name === column);
    if (!exists) this.db.run(\`ALTER TABLE \${table} ADD COLUMN \${column} \${type}\`);
  }

  seedDefaults() {
    const now = this.now();
    if (!Number(this.scalar('SELECT COUNT(*) FROM categories'))) {
      const c1=this.id(), c2=this.id();
      this.run('INSERT INTO categories(id,name,sort_order,created_at,updated_at) VALUES(?,?,?,?,?)',[c1,'مشروبات',1,now,now]);
      this.run('INSERT INTO categories(id,name,sort_order,created_at,updated_at) VALUES(?,?,?,?,?)',[c2,'وجبات',2,now,now]);
      const items=[[this.id(),c1,'شاي',20],[this.id(),c1,'قهوة',35],[this.id(),c2,'وجبة رئيسية',120],[this.id(),c2,'ساندوتش',65]];
      for(const [id,cid,name,price] of items) this.run('INSERT INTO products(id,category_id,name,price,created_at,updated_at) VALUES(?,?,?,?,?,?)',[id,cid,name,price,now,now]);
    }
    if (!Number(this.scalar('SELECT COUNT(*) FROM payment_methods'))) {
      for (const [name,code,sort] of [['نقدي','cash',1],['فيزا','card',2],['محفظة','wallet',3]]) {
        this.run('INSERT INTO payment_methods(id,name,code,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)',[this.id(),name,code,sort,now,now]);
      }
    }
    if (!Number(this.scalar('SELECT COUNT(*) FROM dining_tables'))) {
      for(let i=1;i<=8;i++) this.run('INSERT INTO dining_tables(id,name,area,seats,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[this.id(),\`طاولة \${i}\`,'الصالة',4,i,now,now]);
    }
    const s=this.getSettings();
    const defaults={business_name:'',enable_dinein:true,enable_delivery:true,receipt_footer:'شكراً لزيارتكم',invoice_width:'80'};
    const missing={};
    for(const [k,v] of Object.entries(defaults)) if(!(k in s)) missing[k]=v;
    if(Object.keys(missing).length) this.setSettings(missing);
  }

  persist(){ fs.mkdirSync(path.dirname(this.file),{recursive:true}); fs.writeFileSync(this.file,Buffer.from(this.db.export())); }
  run(sql,params=[]){ this.db.run(sql,params); }
  rows(sql,params=[]){ const stmt=this.db.prepare(sql);stmt.bind(params);const out=[];while(stmt.step())out.push(stmt.getAsObject());stmt.free();return out; }
  one(sql,params=[]){ return this.rows(sql,params)[0]||null; }
  scalar(sql,params=[]){ const r=this.one(sql,params);return r?Object.values(r)[0]:null; }
  id(){ return crypto.randomUUID(); }
  now(){ return new Date().toISOString(); }
  queue(entity,entityId,operation='upsert'){
    this.run('DELETE FROM sync_queue WHERE entity=? AND entity_id=?',[entity,entityId]);
    this.run('INSERT INTO sync_queue(entity,entity_id,operation,created_at) VALUES(?,?,?,?)',[entity,entityId,operation,this.now()]);
  }

  hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return{hash:crypto.scryptSync(password,salt,64).toString('hex'),salt}}
  verifyPassword(password,salt,hash){return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(hash,'hex'))}
  hasUsers(){return Number(this.scalar('SELECT COUNT(*) FROM users'))>0}
  createUser({name,username,password,role='cashier',permissions={}}){
    if(!name||!username||!password)throw new Error('بيانات المستخدم غير مكتملة');
    if(!['administrator','admin','cashier'].includes(role))throw new Error('صلاحية غير صحيحة');
    const {hash,salt}=this.hashPassword(password),id=this.id(),now=this.now();
    this.run('INSERT INTO users(id,name,username,password_hash,salt,role,permissions_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',[id,name,username.trim(),hash,salt,role,JSON.stringify(permissions||{}),now,now]);
    this.persist();return{id,name,username,role};
  }
  updateUser(id,data){
    const now=this.now(),u=this.one('SELECT * FROM users WHERE id=?',[id]);if(!u)throw new Error('المستخدم غير موجود');
    const role=data.role||u.role,active=data.active===undefined?u.active:(data.active?1:0);
    this.run('UPDATE users SET name=?,role=?,active=?,permissions_json=?,updated_at=? WHERE id=?',[data.name||u.name,role,active,JSON.stringify(data.permissions||JSON.parse(u.permissions_json||'{}')),now,id]);
    if(data.password){const {hash,salt}=this.hashPassword(data.password);this.run('UPDATE users SET password_hash=?,salt=?,updated_at=? WHERE id=?',[hash,salt,now,id])}
    this.persist();return true;
  }
  login(username,password){const u=this.one('SELECT * FROM users WHERE username=? AND active=1',[String(username||'').trim()]);if(!u||!this.verifyPassword(password||'',u.salt,u.password_hash))return null;return{id:u.id,name:u.name,username:u.username,role:u.role,permissions:JSON.parse(u.permissions_json||'{}')}}

  getSettings(){const out={};for(const r of this.rows('SELECT key,value FROM settings')){try{out[r.key]=JSON.parse(r.value)}catch{out[r.key]=r.value}}return out}
  setSettings(obj){const now=this.now();for(const[k,v]of Object.entries(obj||{}))this.run('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[k,JSON.stringify(v),now]);this.persist()}

  listCategories(includeInactive=false){return this.rows(\`SELECT * FROM categories \${includeInactive?'':'WHERE active=1'} ORDER BY sort_order,name\`)}
  listProducts(includeInactive=false){return this.rows(\`SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id \${includeInactive?'':'WHERE p.active=1'} ORDER BY c.sort_order,p.name\`)}
  upsertCategory(data){
    if(!String(data.name||'').trim())throw new Error('اكتب اسم القسم');
    const id=data.id||this.id(),now=this.now(),old=data.id?this.one('SELECT * FROM categories WHERE id=?',[data.id]):null;
    this.run('INSERT INTO categories(id,name,sort_order,active,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order,active=excluded.active,updated_at=excluded.updated_at,sync_status=\\'pending\\'',[id,data.name.trim(),Number(data.sort_order??old?.sort_order??0),data.active===false?0:1,old?.created_at||now,now]);
    this.queue('categories',id);this.persist();return id;
  }
  removeCategory(id){this.run("UPDATE categories SET active=0,updated_at=?,sync_status='pending' WHERE id=?",[this.now(),id]);this.queue('categories',id);this.persist();return true}
  upsertProduct(data){
    if(!String(data.name||'').trim())throw new Error('اكتب اسم الصنف');
    const id=data.id||this.id(),now=this.now(),old=data.id?this.one('SELECT * FROM products WHERE id=?',[data.id]):null;
    this.run('INSERT INTO products(id,category_id,sku,barcode,name,price,cost,tax_rate,active,kitchen_printer,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,sku=excluded.sku,barcode=excluded.barcode,name=excluded.name,price=excluded.price,cost=excluded.cost,tax_rate=excluded.tax_rate,active=excluded.active,kitchen_printer=excluded.kitchen_printer,updated_at=excluded.updated_at,sync_status=\\'pending\\'',[id,data.category_id||null,data.sku||'',data.barcode||'',data.name.trim(),Number(data.price||0),Number(data.cost||0),Number(data.tax_rate||0),data.active===false?0:1,data.kitchen_printer||'',old?.created_at||now,now]);
    this.queue('products',id);this.persist();return id;
  }
  removeProduct(id){this.run("UPDATE products SET active=0,updated_at=?,sync_status='pending' WHERE id=?",[this.now(),id]);this.queue('products',id);this.persist();return true}

  findCustomer(mobile){return this.one('SELECT * FROM customers WHERE mobile=?',[String(mobile||'').trim()])}
  getCustomer(id){const c=this.one('SELECT * FROM customers WHERE id=?',[id]);if(!c)return null;c.addresses=this.rows('SELECT * FROM customer_addresses WHERE customer_id=? ORDER BY is_default DESC,created_at DESC',[id]);return c}
  listCustomers(search=''){
    const q=\`%\${String(search||'').trim()}%\`;
    return this.rows(\`SELECT c.*,
      (SELECT address FROM customer_addresses a WHERE a.customer_id=c.id ORDER BY is_default DESC,created_at DESC LIMIT 1) address,
      (SELECT area FROM customer_addresses a WHERE a.customer_id=c.id ORDER BY is_default DESC,created_at DESC LIMIT 1) area,
      COUNT(o.id) order_count,COALESCE(SUM(CASE WHEN o.status='closed' THEN o.total ELSE 0 END),0) total_spent,MAX(o.created_at) last_order
      FROM customers c LEFT JOIN orders o ON o.customer_id=c.id
      WHERE c.name LIKE ? OR c.mobile LIKE ? OR EXISTS(SELECT 1 FROM customer_addresses a2 WHERE a2.customer_id=c.id AND (a2.address LIKE ? OR a2.area LIKE ?))
      GROUP BY c.id ORDER BY COALESCE(MAX(o.created_at),c.created_at) DESC LIMIT 500\`,[q,q,q,q]);
  }
  saveCustomer(data){
    const mobile=String(data.mobile||'').trim();if(!mobile)throw new Error('رقم الموبايل مطلوب');
    const now=this.now(),existing=this.findCustomer(mobile),id=existing?.id||data.id||this.id();
    this.run('INSERT INTO customers(id,name,mobile,notes,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,mobile=excluded.mobile,notes=excluded.notes,updated_at=excluded.updated_at,sync_status=\\'pending\\'',[id,String(data.name||'').trim(),mobile,data.notes||'',existing?.created_at||now,now]);
    this.queue('customers',id);
    if(data.address){
      let addressId=data.address_id;
      if(data.add_new_address)addressId=null;
      if(!addressId){const def=this.one('SELECT id FROM customer_addresses WHERE customer_id=? AND is_default=1',[id]);addressId=data.add_new_address?this.id():(def?.id||this.id())}
      if(data.make_default!==false)this.run('UPDATE customer_addresses SET is_default=0 WHERE customer_id=?',[id]);
      const old=this.one('SELECT created_at FROM customer_addresses WHERE id=?',[addressId]);
      this.run('INSERT INTO customer_addresses(id,customer_id,label,address,area,is_default,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,address=excluded.address,area=excluded.area,is_default=excluded.is_default,notes=excluded.notes,updated_at=excluded.updated_at,sync_status=\\'pending\\'',[addressId,id,data.address_label||'عنوان',data.address,data.area||'',data.make_default===false?0:1,data.address_notes||'',old?.created_at||now,now]);
      this.queue('customer_addresses',addressId);
    }
    this.persist();return this.getCustomer(id);
  }

  listDrivers(includeInactive=false){return this.rows(\`SELECT * FROM drivers \${includeInactive?'':'WHERE active=1'} ORDER BY name\`)}
  saveDriver(d){if(!String(d.name||'').trim())throw new Error('اكتب اسم الطيار');const id=d.id||this.id(),now=this.now(),old=d.id?this.one('SELECT * FROM drivers WHERE id=?',[d.id]):null;this.run('INSERT INTO drivers(id,name,mobile,active,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,mobile=excluded.mobile,active=excluded.active,updated_at=excluded.updated_at,sync_status=\\'pending\\'',[id,d.name.trim(),d.mobile||'',d.active===false?0:1,old?.created_at||now,now]);this.queue('drivers',id);this.persist();return id}
  removeDriver(id){this.run("UPDATE drivers SET active=0,updated_at=?,sync_status='pending' WHERE id=?",[this.now(),id]);this.queue('drivers',id);this.persist();return true}

  listDiningTables(includeInactive=false){
    return this.rows(\`SELECT t.*,
      (SELECT o.id FROM orders o WHERE o.table_id=t.id AND o.order_type='dinein' AND o.status NOT IN ('closed','returned') ORDER BY o.created_at DESC LIMIT 1) open_order_id,
      (SELECT o.order_no FROM orders o WHERE o.table_id=t.id AND o.order_type='dinein' AND o.status NOT IN ('closed','returned') ORDER BY o.created_at DESC LIMIT 1) open_order_no,
      (SELECT o.total FROM orders o WHERE o.table_id=t.id AND o.order_type='dinein' AND o.status NOT IN ('closed','returned') ORDER BY o.created_at DESC LIMIT 1) open_total
      FROM dining_tables t \${includeInactive?'':'WHERE t.active=1'} ORDER BY t.sort_order,t.name\`);
  }
  saveDiningTable(d){if(!String(d.name||'').trim())throw new Error('اكتب اسم الطاولة');const id=d.id||this.id(),now=this.now(),old=d.id?this.one('SELECT * FROM dining_tables WHERE id=?',[d.id]):null;this.run('INSERT INTO dining_tables(id,name,area,seats,sort_order,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,area=excluded.area,seats=excluded.seats,sort_order=excluded.sort_order,active=excluded.active,updated_at=excluded.updated_at,sync_status=\\'pending\\'',[id,d.name.trim(),d.area||'الصالة',Number(d.seats||4),Number(d.sort_order||0),d.active===false?0:1,old?.created_at||now,now]);this.queue('dining_tables',id);this.persist();return id}
  removeDiningTable(id){const occupied=this.one("SELECT id FROM orders WHERE table_id=? AND order_type='dinein' AND status NOT IN ('closed','returned')",[id]);if(occupied)throw new Error('لا يمكن إيقاف طاولة عليها طلب مفتوح');this.run("UPDATE dining_tables SET active=0,updated_at=?,sync_status='pending' WHERE id=?",[this.now(),id]);this.queue('dining_tables',id);this.persist();return true}
  currentTableOrder(tableId){const o=this.one("SELECT id FROM orders WHERE table_id=? AND order_type='dinein' AND status NOT IN ('closed','returned') ORDER BY created_at DESC LIMIT 1",[tableId]);return o?this.getOrder(o.id):null}

  listPaymentMethods(includeInactive=false){return this.rows(\`SELECT * FROM payment_methods \${includeInactive?'':'WHERE active=1'} ORDER BY sort_order,name\`)}
  savePaymentMethod(d){if(!String(d.name||'').trim()||!String(d.code||'').trim())throw new Error('الاسم والكود مطلوبان');const id=d.id||this.id(),now=this.now(),old=d.id?this.one('SELECT * FROM payment_methods WHERE id=?',[d.id]):null;this.run('INSERT INTO payment_methods(id,name,code,active,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,active=excluded.active,sort_order=excluded.sort_order,updated_at=excluded.updated_at,sync_status=\\'pending\\'',[id,d.name.trim(),d.code.trim(),d.active===false?0:1,Number(d.sort_order||0),old?.created_at||now,now]);this.queue('payment_methods',id);this.persist();return id}
  removePaymentMethod(id){const p=this.one('SELECT code FROM payment_methods WHERE id=?',[id]);if(p?.code==='cash')throw new Error('لا يمكن حذف طريقة الدفع النقدي');this.run("UPDATE payment_methods SET active=0,updated_at=?,sync_status='pending' WHERE id=?",[this.now(),id]);this.queue('payment_methods',id);this.persist();return true}

  nextOrderNo(){return Number(this.scalar('SELECT COALESCE(MAX(order_no),0)+1 FROM orders'))||1}
  calculate(items,deliveryFee=0,discount=0){const subtotal=(items||[]).reduce((s,i)=>s+Number(i.qty||1)*Number(i.unit_price||0),0),delivery=Number(deliveryFee||0),disc=Number(discount||0);return{subtotal,delivery,discount:disc,total:Math.max(0,subtotal+delivery-disc)}}
  createOrder(data){
    const id=this.id(),now=this.now(),no=this.nextOrderNo(),items=data.items||[],c=this.calculate(items,data.delivery_fee,data.discount);
    this.run(\`INSERT INTO orders(id,order_no,order_type,customer_id,address_id,driver_id,table_id,shift_id,user_id,status,subtotal,discount,delivery_fee,total,paid,payment_method,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)\`,[id,no,data.order_type||'takeaway',data.customer_id||null,data.address_id||null,data.driver_id||null,data.table_id||null,data.shift_id||null,data.user_id||null,data.status||'new',c.subtotal,c.discount,c.delivery,c.total,Number(data.paid||0),data.payment_method||'cash',data.notes||'',now,now]);
    this.replaceOrderItems(id,items,now);
    this.queue('orders',id);this.persist();return this.getOrder(id);
  }
  saveOrder(id,data){
    const old=this.getOrder(id);if(!old)throw new Error('الطلب غير موجود');
    const now=this.now(),items=data.items||old.items,c=this.calculate(items,data.delivery_fee??old.delivery_fee,data.discount??old.discount);
    this.run(\`UPDATE orders SET customer_id=?,address_id=?,driver_id=?,table_id=?,status=?,subtotal=?,discount=?,delivery_fee=?,total=?,paid=?,payment_method=?,notes=?,updated_at=?,sync_status='pending' WHERE id=?\`,
      [data.customer_id??old.customer_id,data.address_id??old.address_id,data.driver_id??old.driver_id,data.table_id??old.table_id,data.status||old.status,c.subtotal,c.discount,c.delivery,c.total,Number(data.paid??old.paid),data.payment_method||old.payment_method,data.notes??old.notes,now,id]);
    if(data.items)this.replaceOrderItems(id,items,now);
    this.queue('orders',id);this.persist();return this.getOrder(id);
  }
  replaceOrderItems(orderId,items,now=this.now()){
    const old=this.rows('SELECT id FROM order_items WHERE order_id=?',[orderId]);
    for(const r of old){this.run('DELETE FROM order_items WHERE id=?',[r.id]);this.queue('order_items',r.id,'delete')}
    for(const item of items||[]){const iid=this.id(),qty=Number(item.qty||1),price=Number(item.unit_price||0);this.run('INSERT INTO order_items(id,order_id,product_id,product_name,qty,unit_price,total,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[iid,orderId,item.product_id||null,item.product_name,qty,price,qty*price,item.notes||'',now,now]);this.queue('order_items',iid)}
  }
  getOrder(id){const o=this.one(\`SELECT o.*,c.name customer_name,c.mobile customer_mobile,d.name driver_name,a.address,a.area,t.name table_name
    FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN drivers d ON d.id=o.driver_id
    LEFT JOIN customer_addresses a ON a.id=o.address_id LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.id=?\`,[id]);if(o)o.items=this.rows('SELECT * FROM order_items WHERE order_id=? ORDER BY created_at',[id]);return o}
  listOrders(type=null){const params=[];let w='1=1';if(type){w='o.order_type=?';params.push(type)}return this.rows(\`SELECT o.*,c.name customer_name,c.mobile customer_mobile,d.name driver_name,a.area,t.name table_name
    FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN drivers d ON d.id=o.driver_id
    LEFT JOIN customer_addresses a ON a.id=o.address_id LEFT JOIN dining_tables t ON t.id=o.table_id
    WHERE \${w} ORDER BY o.created_at DESC LIMIT 500\`,params)}
  updateOrderStatus(id,status,extra={}){
    const allowed=['new','open','kitchen','ready','with_driver','awaiting_settlement','closed','returned'];if(!allowed.includes(status))throw new Error('حالة غير صحيحة');
    const now=this.now();let sql="UPDATE orders SET status=?,updated_at=?,sync_status='pending'";const p=[status,now];
    if(status==='kitchen'){sql+=',kitchen_sent_at=?';p.push(now)}
    if(status==='with_driver'){sql+=',driver_loaded_at=?';p.push(now)}
    if(status==='awaiting_settlement'){sql+=',settled_at=NULL'}
    if(status==='closed'){sql+=',settled_at=?';p.push(now)}
    if(status==='returned'){sql+=',returned_at=?';p.push(now)}
    if(extra.driver_id){sql+=',driver_id=?';p.push(extra.driver_id)}
    if(extra.payment_method){sql+=',payment_method=?';p.push(extra.payment_method)}
    if(extra.paid!==undefined){sql+=',paid=?';p.push(Number(extra.paid||0))}
    sql+=' WHERE id=?';p.push(id);this.run(sql,p);this.queue('orders',id);this.persist();return this.getOrder(id);
  }

  openShift(userId,openingCash=0){const existing=this.one("SELECT * FROM shifts WHERE status='open' AND user_id=? ORDER BY opened_at DESC LIMIT 1",[userId]);if(existing)return existing;const id=this.id(),now=this.now();this.run('INSERT INTO shifts(id,user_id,opened_at,opening_cash,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[id,userId,now,Number(openingCash||0),'open',now,now]);this.queue('shifts',id);this.persist();return this.one('SELECT * FROM shifts WHERE id=?',[id])}
  closeShift(id,closingCash,notes=''){const now=this.now();this.run("UPDATE shifts SET status='closed',closed_at=?,closing_cash=?,notes=?,updated_at=?,sync_status='pending' WHERE id=?",[now,Number(closingCash||0),notes,now,id]);this.queue('shifts',id);this.persist();return this.one('SELECT * FROM shifts WHERE id=?',[id])}
  currentShift(userId){return this.one("SELECT * FROM shifts WHERE status='open' AND user_id=? ORDER BY opened_at DESC LIMIT 1",[userId])}
  addExpense(data){if(!data.shift_id)throw new Error('يجب فتح وردية أولاً');const id=this.id(),now=this.now();this.run('INSERT INTO expenses(id,shift_id,title,amount,notes,user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',[id,data.shift_id,data.title,Number(data.amount||0),data.notes||'',data.user_id||null,now,now]);this.queue('expenses',id);this.persist();return id}

  dashboard(){
    const today=new Date().toISOString().slice(0,10);
    const sales=Number(this.scalar("SELECT COALESCE(SUM(total),0) FROM orders WHERE status='closed' AND substr(created_at,1,10)=?",[today]))||0;
    const orders=Number(this.scalar("SELECT COUNT(*) FROM orders WHERE substr(created_at,1,10)=?",[today]))||0;
    const delivery=Number(this.scalar("SELECT COUNT(*) FROM orders WHERE order_type='delivery' AND substr(created_at,1,10)=?",[today]))||0;
    const openDelivery=Number(this.scalar("SELECT COUNT(*) FROM orders WHERE order_type='delivery' AND status NOT IN ('closed','returned')"))||0;
    const openTables=Number(this.scalar("SELECT COUNT(*) FROM orders WHERE order_type='dinein' AND status NOT IN ('closed','returned')"))||0;
    const expenses=Number(this.scalar("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE substr(created_at,1,10)=?",[today]))||0;
    return{sales,orders,delivery,openDelivery,openTables,expenses,recent:this.rows('SELECT order_no,order_type,status,total,created_at FROM orders ORDER BY created_at DESC LIMIT 10')};
  }
}
module.exports = Database;
