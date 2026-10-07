const { createClient } = require('@supabase/supabase-js');

class SyncService {
  constructor(db,secrets){this.db=db;this.secrets=secrets;this.running=false}
  async client(){
    const s=this.db.getSettings();
    const url=s.supabase_url,key=s.supabase_key,email=s.supabase_email,password=this.secrets.get('supabase_password');
    if(!url||!key||!email||!password)throw new Error('بيانات الربط السحابي غير مكتملة');
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {error}=await client.auth.signInWithPassword({email,password});
    if(error)throw error;
    return client;
  }
  mapEntity(row,ctx){
    const copy={...row};delete copy.sync_status;
    copy.business_id=ctx.business_id;copy.branch_id=ctx.branch_id||null;
    return copy;
  }
  async syncNow(){
    if(this.running)return{success:false,message:'المزامنة تعمل بالفعل'};
    this.running=true;
    try{
      const client=await this.client();
      const {data:profile,error:pe}=await client.from('pos_profiles').select('business_id,branch_id,role').single();
      if(pe)throw pe;
      const q=this.db.rows('SELECT * FROM sync_queue ORDER BY id LIMIT 500');
      let done=0;
      const tableMap={
        categories:'pos_categories',products:'pos_products',customers:'pos_customers',
        customer_addresses:'pos_customer_addresses',drivers:'pos_drivers',
        dining_tables:'pos_dining_tables',payment_methods:'pos_payment_methods',
        orders:'pos_orders',order_items:'pos_order_items',shifts:'pos_shifts',expenses:'pos_expenses'
      };
      for(const item of q){
        try{
          const table=tableMap[item.entity];
          if(!table){this.db.run('DELETE FROM sync_queue WHERE id=?',[item.id]);continue}
          if(item.operation==='delete'){
            const {error}=await client.from(table).delete().eq('id',item.entity_id);
            if(error)throw error;
            this.db.run('DELETE FROM sync_queue WHERE id=?',[item.id]);done++;continue;
          }
          const row=this.db.one(`SELECT * FROM ${item.entity} WHERE id=?`,[item.entity_id]);
          if(!row){this.db.run('DELETE FROM sync_queue WHERE id=?',[item.id]);continue}
          const payload=this.mapEntity(row,profile);
          const {error}=await client.from(table).upsert(payload,{onConflict:'id'});
          if(error)throw error;
          this.db.run(`UPDATE ${item.entity} SET sync_status='synced' WHERE id=?`,[item.entity_id]);
          this.db.run('DELETE FROM sync_queue WHERE id=?',[item.id]);done++;
        }catch(e){
          this.db.run('UPDATE sync_queue SET attempts=attempts+1,last_error=? WHERE id=?',[String(e.message||e),item.id]);
        }
      }
      this.db.persist();
      return{success:true,count:done,remaining:this.db.scalar('SELECT COUNT(*) FROM sync_queue')};
    }catch(e){return{success:false,message:e.message||String(e)}}
    finally{this.running=false}
  }
}
module.exports=SyncService;
