// Synthetic, non-secret interoperability vectors for the Flutter protocol port.
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {createCipheriv, createDecipheriv} from 'node:crypto';
import nacl from 'tweetnacl';
import {sealTerminalProvisioningV3Payload} from './vendor/terminalProvisioningV2.ts';
import {sealEncryptedDataKeyEnvelopeV1} from './vendor/encryptedDataKeyEnvelopeV1.ts';
import {deriveBoxPublicKeyFromSeed} from './vendor/boxBundle.ts';
import {stringifySerializedJsonValue, parseSerializedJsonValue} from './vendor/serializedJsonValue.ts';

const base = new URL(import.meta.url.includes('/.generated/')
  ? '../../../../apps/dashboard/' : '../../../apps/dashboard/', import.meta.url);
if (process.argv.includes('--verify')) {
  const {ciphertext,key,value} = JSON.parse(readFileSync(new URL('.dart_tool/happier-dart-wire.json',base)));
  const packet=Buffer.from(ciphertext,'base64');
  const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),packet.subarray(1,13));
  cipher.setAuthTag(packet.subarray(-16));
  const opened=parseSerializedJsonValue(Buffer.concat([cipher.update(packet.subarray(13,-16)),cipher.final()]).toString());
  if(JSON.stringify(opened)!==JSON.stringify(value)) throw Error('Dart AES packet does not match the official JSON envelope');
  console.log('Dart -> Node AES-GCM interoperability passed.');
  process.exit(0);
}
const bytes=(start,n=32)=>Uint8Array.from({length:n},(_,i)=>(start+i)%256);
const secret=bytes(1), publicKey=nacl.box.keyPair.fromSecretKey(secret).publicKey;
const contentKey=bytes(33), dataKey=bytes(65), pairingSecret=bytes(97);
const b64=v=>Buffer.from(v).toString('base64');
const createdAt=1795100000000,expiresAt=createdAt+600000;
let seed=140;
const randomBytes=n=>{seed=(seed+7)%200;return bytes(seed,n);};
const approval=sealTerminalProvisioningV3Payload({contentPrivateKey:contentKey,
  terminalEphemeralPublicKey:publicKey,pairingSecret,createdAtMs:createdAt,expiresAtMs:expiresAt,randomBytes});
const envelope=sealEncryptedDataKeyEnvelopeV1({dataKey,recipientPublicKey:nacl.box.keyPair.fromSecretKey(contentKey).publicKey,randomBytes});
const seedEnvelope=sealEncryptedDataKeyEnvelopeV1({dataKey,recipientPublicKey:deriveBoxPublicKeyFromSeed(contentKey),randomBytes});
const value={request:'synthetic-only',nested:{ok:true},unicode:'연결 확인'};
const nonce=bytes(20,12), cipher=createCipheriv('aes-256-gcm',dataKey,nonce);
const packet=Buffer.concat([Buffer.from([0]),nonce,cipher.update(stringifySerializedJsonValue(value)),cipher.final(),cipher.getAuthTag()]);
mkdirSync(new URL('test/fixtures/',base),{recursive:true});
writeFileSync(new URL('test/fixtures/happier-wire.json',base),JSON.stringify({secret:b64(secret),public:b64(publicKey),contentKey:b64(contentKey),dataKey:b64(dataKey),pairingSecret:b64(pairingSecret),createdAt,expiresAt,approval:b64(approval),envelope:b64(envelope),seedEnvelope:b64(seedEnvelope),ciphertext:b64(packet),value},null,2)+'\n');
console.log('Generated official Happier synthetic protocol vectors.');
