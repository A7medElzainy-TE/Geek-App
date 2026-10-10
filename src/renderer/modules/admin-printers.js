async function adminPrinters(){
  await loadCatalog(true);
  const [devices,routes]=await Promise.all([window.geek.printers.list(),window.geek.printers.routes(true)]);
  const typeName={prep:'تحضير',assembly:'تجميع',receipt:'فاتورة عميل'};
  const orderName={takeaway:'تيك أواي',dinein:'صالة',delivery:'دليفري'};
  const active=routes.filter(r=>r.active);
  $('#adminBody').innerHTML=`
    <div class="printer-hero card">
      <div><h3>إدارة الطابعات ومسارات الطلبات</h3><p class="muted">أنشئ وجهات طباعة بأسماء من اختيارك، واربط أقسام التحضير ومسارات التجميع بأنواع الطلبات.</p></div>
      <div class="actions"><span class="badge green">${devices.length} طابعة Windows</span><button id="newRoute" class="btn btn-cyan">+ وجهة طباعة</button></div>
    </div>
    <div class="printer-grid">
      ${routes.map(r=>`<div class="card printer-card ${!r.active?'disabled-row':''}">
        <div class="section-title"><div><h3>${esc(r.name)}</h3><span class="badge ${r.route_type==='prep'?'blue':r.route_type==='assembly'?'amber':'green'}">${typeName[r.route_type]||r.route_type}</span></div><span class="status-dot ${devices.some(d=>d.name===r.printer_name)?'on':'off'}"></span></div>
        <div class="route-meta"><span>الطابعة</span><b>${esc(r.printer_name)}</b><span>الرول</span><b>${r.paper_width} mm</b><span>النسخ</span><b>${r.copies}</b></div>
        <div class="route-tags">${(r.order_types||[]).map(x=>`<span>${orderName[x]||x}</span>`).join('')||'<span>كل أنواع الطلبات</span>'}</div>
        ${r.route_type!=='prep'?'<div class="muted route-cats">'+((r.category_ids||[]).length?(r.category_ids||[]).map(id=>esc(S.cats.find(c=>c.id===id)?.name||'')).filter(Boolean).join('، '):'كل الأقسام')+'</div>':''}
        <div class="actions route-actions"><button class="btn btn-ghost btn-sm" data-test="${r.id}">اختبار</button><button class="btn btn-ghost btn-sm" data-edit="${r.id}">تعديل</button><button class="btn btn-red btn-sm" data-off="${r.id}">إيقاف</button></div>
      </div>`).join('')||'<div class="card empty">لا توجد وجهات طباعة بعد.</div>'}
    </div>
    <div class="grid grid-3 preview-grid">
      <div class="card"><h3>بون التحضير</h3><button class="btn btn-ghost btn-sm" data-preview="prep">معاينة التصميم</button></div>
      <div class="card"><h3>بون التجميع</h3><button class="btn btn-ghost btn-sm" data-preview="assembly">معاينة التصميم</button></div>
      <div class="card"><h3>فاتورة العميل</h3><div class="muted">مثال الإجمالي: <b>150.00 ج.م</b></div><button class="btn btn-ghost btn-sm" data-preview="receipt">معاينة التصميم</button></div>
    </div>`;

  const editor=r=>{
    const selectedTypes=r?.order_types||[];
    const selectedCats=r?.category_ids||[];
    showModal(`<div class="section-title"><h3>${r?'تعديل وجهة الطباعة':'وجهة طباعة جديدة'}</h3><button id="modalClose" class="btn btn-ghost btn-sm">×</button></div>
      <div class="form-grid">
        <div class="field"><label>اسم الوجهة</label><input id="prName" class="input" value="${esc(r?.name||'')}" placeholder="مثال: مطبخ ساخن / تجميع 1"></div>
        <div class="field"><label>الطابعة الفعلية</label><select id="prDevice" class="select"><option value="">اختر الطابعة</option>${devices.map(d=>`<option value="${esc(d.name)}" ${r?.printer_name===d.name?'selected':''}>${esc(d.displayName||d.name)}</option>`).join('')}</select></div>
        <div class="field"><label>نوع الوجهة</label><select id="prType" class="select"><option value="prep" ${r?.route_type==='prep'?'selected':''}>تحضير</option><option value="assembly" ${r?.route_type==='assembly'?'selected':''}>تجميع</option><option value="receipt" ${r?.route_type==='receipt'?'selected':''}>فاتورة عميل</option></select></div>
        <div class="field"><label>عرض الرول</label><select id="prWidth" class="select"><option value="80" ${String(r?.paper_width||80)==='80'?'selected':''}>80 mm</option><option value="58" ${String(r?.paper_width)==='58'?'selected':''}>58 mm</option></select></div>
        <div class="field"><label>عدد النسخ</label><input id="prCopies" type="number" min="1" max="5" class="input" value="${r?.copies||1}"></div>
        <div class="field"><label>الترتيب</label><input id="prSort" type="number" class="input" value="${r?.sort_order||routes.length+1}"></div>
      </div>
      <div class="field"><label>أنواع الطلبات التي تستقبلها هذه الوجهة</label><div class="check-grid"><label class="check"><input type="checkbox" data-otype="takeaway" ${selectedTypes.includes('takeaway')?'checked':''}> تيك أواي</label><label class="check"><input type="checkbox" data-otype="dinein" ${selectedTypes.includes('dinein')?'checked':''}> صالة</label><label class="check"><input type="checkbox" data-otype="delivery" ${selectedTypes.includes('delivery')?'checked':''}> دليفري</label></div><small class="muted">تركها فارغة يعني كل أنواع الطلبات.</small></div>
      <div id="routeCats" class="field"><label>الأقسام التي تدخل في هذا المسار</label><div class="check-grid">${S.cats.filter(c=>c.active).map(c=>`<label class="check"><input type="checkbox" data-pcat="${c.id}" ${selectedCats.includes(c.id)?'checked':''}> ${esc(c.name)}</label>`).join('')}</div><small class="muted">في التجميع والفاتورة: تركها فارغة يعني كل الأقسام. طابعة التحضير يتم ربطها من شاشة الأقسام.</small></div>
      <label class="check"><input id="prActive" type="checkbox" ${r?.active===0?'':'checked'}> وجهة فعالة</label>
      <div class="modal-footer"><button id="saveRoute" class="btn btn-primary">حفظ وجهة الطباعة</button></div>`);
    const toggleCats=()=>$('#routeCats').style.opacity=$('#prType').value==='prep'?.55:1;
    $('#prType').onchange=toggleCats;toggleCats();
    $('#saveRoute').onclick=async()=>{
      try{
        const order_types=$$('[data-otype]:checked').map(x=>x.dataset.otype);
        const category_ids=$('#prType').value==='prep'?[]:$$('[data-pcat]:checked').map(x=>x.dataset.pcat);
        await window.geek.printers.saveRoute({id:r?.id,name:$('#prName').value,printer_name:$('#prDevice').value,route_type:$('#prType').value,order_types,category_ids,paper_width:Number($('#prWidth').value),copies:Number($('#prCopies').value),sort_order:Number($('#prSort').value),active:$('#prActive').checked});
        closeModal();toast('تم حفظ وجهة الطباعة');adminPrinters();
      }catch(e){toast(e.message,true)}
    };
  };
  $('#newRoute').onclick=()=>editor(null);
  $$('[data-edit]').forEach(b=>b.onclick=()=>editor(routes.find(r=>r.id===b.dataset.edit)));
  $$('[data-off]').forEach(b=>b.onclick=async()=>{await window.geek.printers.removeRoute(b.dataset.off);toast('تم إيقاف وجهة الطباعة');adminPrinters()});
  $$('[data-test]').forEach(b=>b.onclick=async()=>{const r=routes.find(x=>x.id===b.dataset.test);const html=await window.geek.printers.preview(r.route_type==='prep'?'prep':r.route_type==='assembly'?'assembly':'receipt');const out=await window.geek.printers.print(html,r.printer_name);toast(out.success?'تم إرسال اختبار الطباعة':out.message,!out.success)});
  $$('[data-preview]').forEach(b=>b.onclick=async()=>{const html=await window.geek.printers.preview(b.dataset.preview);showModal(`<div class="section-title"><h3>معاينة البون</h3><button id="modalClose" class="btn btn-ghost btn-sm">×</button></div><iframe class="ticket-preview" srcdoc="${esc(html)}"></iframe>`)});
}