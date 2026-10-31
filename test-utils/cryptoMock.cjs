const crypto=require('node:crypto');
const {Buffer}=require('node:buffer');
class Key{
  constructor(bytes){this.raw=bytes;}
  static async generate(){return new Key(crypto.randomBytes(32));}
  static async import(value){return new Key(Buffer.from(value,'base64'));}
  async encoded(){return this.raw.toString('base64');}
}
class Sealed{
  constructor(raw){this.raw=raw;}
  static fromCombined(value){
    if(!(value instanceof Uint8Array))throw new TypeError('Native fromCombined requires bytes');
    return new Sealed(Buffer.from(value));
  }
  async combined(){return this.raw.toString('base64');}
}
module.exports={AESEncryptionKey:Key,AESKeySize:{AES256:256},AESSealedData:Sealed,
  aesEncryptAsync:async(value,key,options)=>{
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key.raw,iv);cipher.setAAD(Buffer.from(options.additionalData));
    return new Sealed(Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]));
  },
  aesDecryptAsync:async(sealed,key,options)=>{
    const raw=sealed.raw,decipher=crypto.createDecipheriv('aes-256-gcm',key.raw,raw.subarray(0,12));decipher.setAAD(Buffer.from(options.additionalData));decipher.setAuthTag(raw.subarray(raw.length-16));
    return new Uint8Array(Buffer.concat([decipher.update(raw.subarray(12,-16)),decipher.final()]));
  },
};
