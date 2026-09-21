// Wire formats adapted from happier-dev/happier at
// e992e049ffa7a98ab60740ac60f94918f022ff24 (MIT).
// See dashboard/tools/happier/vendor/NOTICE.md and this directory's NOTICE.md.
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:pinenacl/x25519.dart' as nacl;

class HappierCrypto {
  static final _aes = AesGcm.with256bits();
  static final _random = Random.secure();
  static Uint8List random(int length) =>
      Uint8List.fromList(List.generate(length, (_) => _random.nextInt(256)));
  static Uint8List bytes(String value) =>
      base64.decode(base64.normalize(value));
  static String b64(List<int> value) => base64.encode(value);
  static String url64(List<int> value) =>
      base64Url.encode(value).replaceAll('=', '');
  static Uint8List publicKey(Uint8List secret) =>
      nacl.PrivateKey(secret).publicKey.asTypedList;
  static Future<List<int>> sha256(List<int> value) async =>
      (await Sha256().hash(value)).bytes;

  static Future<String> encrypt(Object? value, Uint8List key) async {
    final box = await _aes.encrypt(
      utf8.encode(
        jsonEncode({
          '__happierSerializedJsonValueV1': true,
          'type': 'json',
          'value': value,
        }),
      ),
      secretKey: SecretKey(key),
      nonce: random(12),
    );
    return b64([0, ...box.nonce, ...box.cipherText, ...box.mac.bytes]);
  }

  static Future<dynamic> decrypt(String value, Uint8List key) async {
    final packet = bytes(value);
    if (packet.length < 29 || packet[0] != 0) {
      throw const FormatException('지원하지 않는 Happier 암호화 형식입니다.');
    }
    final plain = await _aes.decrypt(
      SecretBox(
        packet.sublist(13, packet.length - 16),
        nonce: packet.sublist(1, 13),
        mac: Mac(packet.sublist(packet.length - 16)),
      ),
      secretKey: SecretKey(key),
    );
    final text = utf8.decode(plain);
    if (text == 'undefined') return null;
    final decoded = jsonDecode(text);
    if (decoded is Map && decoded['__happierSerializedJsonValueV1'] == true) {
      return decoded['type'] == 'undefined' ? null : decoded['value'];
    }
    return decoded;
  }

  static Future<Uint8List> _openBox(Uint8List bundle, Uint8List secret) async {
    if (bundle.length < 72 || secret.length != 32) {
      throw const FormatException('Happier 키 봉투가 올바르지 않습니다.');
    }
    final sender = nacl.PublicKey(bundle.sublist(0, 32));
    final encrypted = nacl.EncryptedMessage.fromList(bundle.sublist(32));
    // The official client accepts both a raw Curve25519 key and a sodium seed.
    for (final key in [
      nacl.PrivateKey(secret),
      nacl.PrivateKey.fromSeed(secret),
    ]) {
      try {
        return nacl.Box(
          myPrivateKey: key,
          theirPublicKey: sender,
        ).decrypt(encrypted);
      } catch (_) {
        // Try the legacy seed derivation, then fail closed.
      }
    }
    throw const FormatException('현재 Happier 계정으로 암호화 키를 열지 못했습니다.');
  }

  static Future<Uint8List> rowKey(
    Map<String, dynamic> row,
    Uint8List secret,
  ) async {
    final encoded = row['dataEncryptionKey'];
    if (row['encryptionMode'] == 'plain' || encoded is! String) {
      throw const FormatException('암호화된 Happier 세션만 연결할 수 있습니다.');
    }
    final envelope = bytes(encoded);
    if (envelope.isEmpty || envelope[0] != 0) {
      throw const FormatException('지원하지 않는 Happier 키 봉투입니다.');
    }
    final key = await _openBox(envelope.sublist(1), secret);
    if (key.length != 32) throw const FormatException('Happier 키 길이가 잘못되었습니다.');
    return key;
  }

  static Uint8List _canonical(List<List<int>> parts) {
    final builder = BytesBuilder();
    for (final part in parts) {
      final size = ByteData(4)..setUint32(0, part.length, Endian.big);
      builder.add(size.buffer.asUint8List());
      builder.add(part);
    }
    return builder.takeBytes();
  }

  static Future<Uint8List> openApproval({
    required String response,
    required Uint8List secret,
    required Uint8List public,
    required Uint8List pairingSecret,
    required int createdAt,
    required int expiresAt,
    required int now,
  }) async {
    final packet = bytes(response);
    if (secret.length != 32 ||
        public.length != 32 ||
        pairingSecret.length != 32 ||
        createdAt < 0 ||
        expiresAt <= createdAt ||
        now < createdAt ||
        now > expiresAt ||
        (packet.length != 141 && packet.length != 109) ||
        packet[0] != 0x48 ||
        packet[1] != 0x50 ||
        packet[2] != 0x56 ||
        packet[3] != 0x33) {
      throw const FormatException('Happier 승인 응답이 만료되었거나 올바르지 않습니다.');
    }
    final sealed = packet.sublist(4, packet.length - 32);
    final mac = Hmac.sha256();
    final expected = await mac.calculateMac(
      _canonical([
        utf8.encode('happier-terminal-provisioning-v3'),
        public,
        utf8.encode('$createdAt'),
        utf8.encode('$expiresAt'),
        sealed,
      ]),
      secretKey: SecretKey(pairingSecret),
    );
    // Mac equality uses the cryptography package's constant-time byte comparison.
    if (expected != Mac(packet.sublist(packet.length - 32))) {
      throw const FormatException('Happier 승인 응답의 암호화 검증에 실패했습니다.');
    }
    final plain = await _openBox(sealed, secret);
    if (plain.length != 33 || plain[0] != 0) {
      throw const FormatException('세션 복호화 권한이 없는 연결입니다. 다시 승인해주세요.');
    }
    return plain.sublist(1);
  }
}
