const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SUPABASE_URL = 'https://redkjjglxdouxplcljil.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3KBgfOWVfFapMfs_chTH-w_W8uWpfYc';

function rawMachineIdentity() {
  let machineGuid = '';
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8' });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
      machineGuid = m ? m[1].trim() : '';
    } catch (_) {}
  }
  return `${machineGuid || os.hostname()}|${os.hostname()}`;
}
function machineHash() {
  return crypto.createHash('sha256').update(rawMachineIdentity(), 'utf8').digest('hex');
}
function licensePath() {
  if (process.platform === 'win32') {
    const root = process.env.ProgramData || 'C:\\ProgramData';
    return path.join(root, 'Geek POS', 'license.json');
  }
  return path.join(os.homedir(), '.geek-pos-license.json');
}
function readLocalLicense() {
  try {
    const p = licensePath();
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data || !data.activation_token || data.device_hash !== machineHash()) return null;
    return data;
  } catch (_) { return null; }
}
function writeLocalLicense(data) {
  const p = licensePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = { ...data, device_hash: machineHash(), saved_at: new Date().toISOString() };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}
async function activateLicense(licenseKey, appVersion = '0.1.0') {
  const key = String(licenseKey || '').trim().toUpperCase();
  if (!/^GEEK-[A-Z0-9-]{20,}$/.test(key)) return { success:false, message:'صيغة مفتاح التفعيل غير صحيحة' };
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/activate_license`, {
      method:'POST',
      headers:{apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json'},
      body:JSON.stringify({p_license_key:key,p_device_hash:machineHash(),p_app_version:appVersion})
    });
    if (!response.ok) return {success:false,message:'تعذر التحقق من المفتاح. تأكد من الاتصال بالإنترنت وإعداد قاعدة البيانات.'};
    const result = await response.json();
    if (!result?.success) return {success:false,message:result?.message || 'مفتاح التفعيل غير صالح'};
    const payload = writeLocalLicense({license_key:key,activation_token:result.activation_token,device_hash:machineHash(),activated_at:result.activated_at || new Date().toISOString()});
    return {success:true,license:payload,message:'تم تفعيل Geek POS بنجاح'};
  } catch (_) {
    return {success:false,message:'لا يمكن الوصول إلى خادم التفعيل حالياً'};
  }
}
module.exports = { SUPABASE_URL, SUPABASE_KEY, machineHash, readLocalLicense, writeLocalLicense, activateLicense };
