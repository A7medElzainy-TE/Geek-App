-- Geek POS activation hotfix
-- Makes pgcrypto functions visible inside the SECURITY DEFINER RPC on Supabase.

create extension if not exists pgcrypto;

create or replace function public.activate_license(
  p_license_key text,
  p_device_hash text,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_row public.pos_licenses%rowtype;
begin
  v_hash := encode(digest(upper(trim(p_license_key)), 'sha256'), 'hex');

  select *
    into v_row
  from public.pos_licenses
  where license_hash = v_hash
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'message', 'مفتاح التفعيل غير صحيح. تواصل مع الإدارة المالكة للتطبيق لشراء نسخة.'
    );
  end if;

  if v_row.status = 'revoked' then
    return jsonb_build_object(
      'success', false,
      'message', 'تم إيقاف هذا المفتاح. تواصل مع الإدارة المالكة للتطبيق.'
    );
  end if;

  if v_row.status = 'active'
     and v_row.machine_hash is distinct from p_device_hash then
    return jsonb_build_object(
      'success', false,
      'message', 'هذا المفتاح مستخدم بالفعل على جهاز آخر.'
    );
  end if;

  if v_row.activation_token is null then
    v_row.activation_token := gen_random_uuid();
  end if;

  update public.pos_licenses
  set
    status = 'active',
    machine_hash = p_device_hash,
    activation_token = v_row.activation_token,
    app_version = p_app_version,
    activated_at = coalesce(activated_at, now()),
    last_seen_at = now(),
    updated_at = now()
  where id = v_row.id;

  return jsonb_build_object(
    'success', true,
    'message', 'تم التفعيل بنجاح',
    'activation_token', v_row.activation_token,
    'activated_at', coalesce(v_row.activated_at, now())
  );
end
$$;

revoke all on function public.activate_license(text,text,text) from public;
grant execute on function public.activate_license(text,text,text) to anon, authenticated;

notify pgrst, 'reload schema';
