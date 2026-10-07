# Geek POS

تطبيق نقاط بيع Windows عربي بالكامل، RTL، بخط Tajawal، يعمل Offline-first ويزامن مع Supabase عند عودة الإنترنت.

## الإصدار 0.1.0
- كاشير: تيك أواي / صالة / دليفري.
- ورديات ومصروفات.
- قاعدة عملاء مستقلة مع عدة عناوين ومنطقة وربط CustomerId بالطلبات.
- دورة دليفري: جديد → المطبخ → جاهز → مع الطيار → تسوية → مغلق / مرتجع.
- إدارة أصناف وأقسام ومستخدمين بأدوار administrator / admin / cashier.
- تصدير العملاء إلى XLSX حقيقي.
- اكتشاف طابعات Windows واختيار الطابعة.
- قاعدة محلية sql.js للعمل دون إنترنت.
- Queue للمزامنة إلى Supabase.
- لوحة Online داخل docs/.
- Installer بنظام NSIS يطلب مفتاح التفعيل ويتحقق منه Online قبل التثبيت.

## Supabase
المشروع مضبوط على:
https://redkjjglxdouxplcljil.supabase.co

المفتاح الموجود في التطبيق هو Publishable Key فقط. لا تضع service_role أو Database Password في GitHub أو HTML.

نفّذ ملفات supabase/migrations بالترتيب داخل Supabase SQL Editor أو بواسطة Supabase CLI. ملفات seed العامة تحتوي SHA-256 للمفاتيح فقط، وليس المفاتيح الأصلية.

بعد إنشاء حساب Supabase Auth، اربطه بنشاط وفرع:
```sql
insert into public.pos_businesses(name) values ('نشاط تجريبي') returning id;
insert into public.pos_branches(business_id,name) values ('BUSINESS_UUID','الفرع الرئيسي') returning id;
insert into public.pos_profiles(user_id,business_id,branch_id,display_name,role)
values ('AUTH_USER_UUID','BUSINESS_UUID','BRANCH_UUID','المدير','admin');
```

## Build
أي Push على main يشغل GitHub Actions ويولد Artifact باسم Geek-POS-Windows يحتوي:
Geek-POS-Setup-0.1.0.exe

## الأمان
التفعيل مربوط ببصمة الجهاز على Supabase ويُحفظ محلياً للعمل Offline. لا توجد كلمة مرور افتراضية للحساب الأول. ولحماية تجارية أعلى لاحقاً يفضل توقيع تراخيص غير متماثل عبر Edge Function.
