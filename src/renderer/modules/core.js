const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const S={boot:null,user:null,page:'dashboard',cats:[],products:[],deliveryTab:'orders',adminTab:'business',shift:null,settings:{},payments:[]};
const AR={new:'جديد',open:'مفتوح',kitchen:'في المطبخ',ready:'جاهز',with_driver:'مع الطيار',awaiting_settlement:'بانتظار التسوية',closed:'مغلق',returned:'مرتجع'};
const TYPE={takeaway:'تيك أواي',dinein:'صالة',delivery:'دليفري'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م';

function toast(m,bad=false){const t=$('#toast');t.textContent=m;t.className='toast show'+(bad?' error':'');setTimeout(()=>t.className='toast',3000)}
function title(t){$('#title').textContent=t}
function closeModal(){ $('#modal').classList.add('hidden'); $('#modalBody').innerHTML=''; }
function showModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden');const c=$('#modalClose');if(c)c.onclick=closeModal}
function roleAllowed(p){if(!S.user)return false;if(['administrator','admin'].includes(S.user.role))return true;return ['dashboard','pos','hall','delivery','shift'].includes(p)}
async function loadCatalog(all=false){S.cats=await window.geek.categories(all);S.products=await window.geek.products(all)}
async function refreshSettings(){S.settings=await window.geek.settings.get();S.payments=await window.geek.payments.list()}

async function boot(){S.boot=await window.geek.bootstrap();S.settings=S.boot.settings||{};if(!S.boot.licensed)return activation();if(!S.boot.hasUsers)return firstUser();login()}
function activation(){
  $('#root').innerHTML=`<section class="auth-shell"><div class="auth-card"><img class="brand-logo" src="logo.jpg"><h1>تفعيل Geek POS</h1><p>يلزم الإنترنت للتفعيل مرة واحدة فقط، وبعدها يعمل البرنامج دون اتصال.</p><div class="field"><label>مفتاح التفعيل</label><input id="lk" class="input" dir="ltr" placeholder="GEEK-XXXX-XXXX-XXXX-XXXX-XXXX"></div><button id="act" class="btn btn-primary btn-block">تفعيل النسخة</button><p class="help">في حالة عدم امتلاك مفتاح صالح تواصل مع الإدارة المالكة للتطبيق.</p></div></section>`;
  $('#act').onclick=async()=>{const r=await window.geek.activate($('#lk').value);if(!r.success)return toast(r.message,true);toast(r.message);S.boot=await window.geek.bootstrap();firstUser()}
}
function firstUser(){
  $('#root').innerHTML=`<section class="auth-shell"><div class="auth-card"><img class="brand-logo" src="logo.jpg"><h1>إنشاء مدير النشاط</h1><p>الحساب الأول هو مدير النشاط التجاري.</p><div class="field"><label>الاسم</label><input id="n" class="input"></div><div class="field"><label>اسم المستخدم</label><input id="u" class="input" dir="ltr"></div><div class="field"><label>كلمة المرور</label><input id="p" type="password" class="input" dir="ltr"></div><button id="mk" class="btn btn-primary btn-block">إنشاء الحساب</button></div></section>`;
  $('#mk').onclick=async()=>{try{await window.geek.createFirstUser({name:$('#n').value,username:$('#u').value,password:$('#p').value});toast('تم إنشاء الحساب');login()}catch(e){toast(e.message,true)}}
}
function login(){
  $('#root').innerHTML=`<section class="auth-shell"><div class="auth-card"><img class="brand-logo" src="logo.jpg"><h1>Geek POS</h1><p>نظام إدارة نقاط البيع</p><div class="field"><label>اسم المستخدم</label><input id="lu" class="input" dir="ltr"></div><div class="field"><label>كلمة المرور</label><input id="lp" type="password" class="input" dir="ltr"></div><button id="go" class="btn btn-primary btn-block">دخول</button></div></section>`;
  $('#go').onclick=async()=>{const u=await window.geek.login($('#lu').value,$('#lp').value);if(!u)return toast('بيانات الدخول غير صحيحة',true);S.user=u;S.shift=await window.geek.shifts.current(u.id);await refreshSettings();await loadCatalog();shell()}
}
function nav(){const x=[['dashboard','⌂','الرئيسية'],['pos','▣','الكاشير']];if(S.settings.enable_dinein!==false)x.push(['hall','▦','الصالة']);if(S.settings.enable_delivery!==false)x.push(['delivery','⌁','الدليفري']);x.push(['shift','◷','الورديات']);if(['administrator','admin'].includes(S.user.role))x.push(['reports','◫','التقارير'],['admin','⚙','لوحة الإدارة']);return x.filter(a=>roleAllowed(a[0])).map(a=>`<button data-page="${a[0]}"><span class="icon">${a[1]}</span><span class="label">${a[2]}</span></button>`).join('')}
function shell(){
  $('#root').innerHTML=`<div class="app"><aside class="sidebar"><div class="side-brand"><img src="logo.jpg"><div><strong>Geek POS</strong><small>${esc(S.settings.business_name||'نقطة البيع')}</small></div></div><nav class="nav">${nav()}</nav><div class="side-foot"><div class="user-chip"><strong>${esc(S.user.name)}</strong><span>${S.user.role==='administrator'?'Administrator':S.user.role==='admin'?'مدير النشاط':'كاشير'}</span></div><button id="out" class="btn btn-ghost btn-block">تسجيل الخروج</button></div></aside><section class="workspace"><header class="topbar"><h2 id="title"></h2><div class="top-actions"><span class="net-dot"></span><span class="muted" id="shiftState">${S.shift?'وردية مفتوحة':'لا توجد وردية'}</span><button id="sync" class="btn btn-sm btn-ghost">مزامنة</button></div></header><div id="content" class="content"></div></section></div>`;
  $$('.nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));$('#out').onclick=()=>{S.user=null;login()};$('#sync').onclick=async()=>{const r=await window.geek.sync();toast(r.success?`تمت مزامنة ${r.count} عنصر`:r.message,!r.success)};go('dashboard')
}
async function go(p){if(!roleAllowed(p))return;S.page=p;$$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));const f={dashboard,pos,hall,delivery,shift,reports,admin:adminPanel};await f[p]()}

async function dashboard(){
  title('لوحة المتابعة');const d=await window.geek.dashboard();
  $('#content').innerHTML=`<div class="grid grid-4"><div class="card kpi"><div class="label">مبيعات اليوم</div><div class="value">${money(d.sales)}</div></div><div class="card kpi"><div class="label">طلبات اليوم</div><div class="value">${d.orders}</div></div><div class="card kpi"><div class="label">طاولات مشغولة</div><div class="value">${d.openTables}</div></div><div class="card kpi"><div class="label">دليفري مفتوح</div><div class="value">${d.openDelivery}</div></div></div><div class="grid grid-2 dashboard-lower"><div class="card"><div class="section-title"><h3>آخر الطلبات</h3><button id="sale" class="btn btn-cyan btn-sm">بيع جديد</button></div><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>النوع</th><th>الحالة</th><th>الإجمالي</th><th>الوقت</th></tr></thead><tbody>${d.recent.map(o=>`<tr><td>#${o.order_no}</td><td>${TYPE[o.order_type]||o.order_type}</td><td><span class="badge blue">${AR[o.status]||o.status}</span></td><td>${money(o.total)}</td><td>${new Date(o.created_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">لا توجد طلبات</td></tr>'}</tbody></table></div></div><div class="card quick"><h3>تشغيل سريع</h3><div class="quick-grid"><button data-q="pos">تيك أواي</button>${S.settings.enable_dinein!==false?'<button data-q="hall">فتح الصالة</button>':''}${S.settings.enable_delivery!==false?'<button data-q="delivery">طلب دليفري</button>':''}<button data-q="shift">الوردية</button></div><div class="metric-row"><span>مصروفات اليوم</span><b>${money(d.expenses)}</b></div></div></div>`;
  $('#sale').onclick=()=>go('pos');$$('[data-q]').forEach(b=>b.onclick=()=>go(b.dataset.q));
}

