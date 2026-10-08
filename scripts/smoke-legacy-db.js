const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const Database = require('../src/main/database');

(async()=>{
  const dir=path.join(process.cwd(),'.geek-legacy-smoke');
  fs.rmSync(dir,{recursive:true,force:true});
  fs.mkdirSync(dir,{recursive:true});

  const wasm=path.join(process.cwd(),'node_modules','sql.js','dist','sql-wasm.wasm');
  const SQL=await initSqlJs({locateFile:()=>wasm});
  const legacy=new SQL.Database();
  legacy.run(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      order_no INTEGER NOT NULL,
      order_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  fs.writeFileSync(path.join(dir,'geek-pos.sqlite'),Buffer.from(legacy.export()));
  legacy.close();

  const db=await new Database(dir).init();
  const cols=db.rows('PRAGMA table_info(orders)').map(x=>x.name);
  if(!cols.includes('table_id')) throw new Error('Legacy migration failed: table_id was not added');

  const indexes=db.rows("PRAGMA index_list('orders')").map(x=>x.name);
  if(!indexes.includes('idx_orders_table')) throw new Error('Legacy migration failed: idx_orders_table missing');

  console.log('GEEK_LEGACY_MIGRATION_OK');
  fs.rmSync(dir,{recursive:true,force:true});
})().catch(err=>{console.error(err);process.exit(1)});
