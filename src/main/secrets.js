const fs=require('fs');
const path=require('path');
const {safeStorage}=require('electron');

class Secrets{
  constructor(userData){
    this.file=path.join(userData,'secrets.json');
    this.data={};
    try{if(fs.existsSync(this.file))this.data=JSON.parse(fs.readFileSync(this.file,'utf8'))}catch{}
  }
  set(key,value){
    if(!value){delete this.data[key];}
    else if(safeStorage.isEncryptionAvailable()){this.data[key]=safeStorage.encryptString(String(value)).toString('base64')}
    else {this.data[key]=Buffer.from(String(value),'utf8').toString('base64')}
    this.save();
  }
  get(key){
    const v=this.data[key]; if(!v)return '';
    try{
      const b=Buffer.from(v,'base64');
      return safeStorage.isEncryptionAvailable()?safeStorage.decryptString(b):b.toString('utf8')
    }catch{return ''}
  }
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.data,null,2),'utf8')}
}
module.exports=Secrets;
