import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'happier_client.dart';
import 'happier_models.dart';

/// Each Firebase user has a separate vault. Web credentials live only in memory.
class HappierSecureVault implements HappierVault {
  HappierSecureVault(this.owner);
  final String owner;
  static final _webSessions = <String, Map<String, dynamic>>{};
  static const _storage = FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.unlocked_this_device,
    ),
  );
  String get _key => 'find.happier.v1.$owner';

  @override
  Future<Map<String, dynamic>> load() async {
    if (kIsWeb) return objectMap(_webSessions[owner]);
    final value = await _storage.read(key: _key);
    return value == null ? {} : objectMap(jsonDecode(value));
  }

  @override
  Future<void> save(Map<String, dynamic> value) async {
    if (kIsWeb) {
      _webSessions[owner] = value;
      return;
    }
    await _storage.write(key: _key, value: jsonEncode(value));
  }
}
