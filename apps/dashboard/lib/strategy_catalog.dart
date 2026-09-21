import 'dart:convert';

import 'package:flutter/services.dart';

Map<String, dynamic> object(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : {};
List<dynamic> items(Object? value) => value is List ? value : [];
String text(Object? value) => value?.toString() ?? '';

class StrategyCatalog {
  StrategyCatalog(this.data);
  final Map<String, dynamic> data;
  static Future<StrategyCatalog> load() async => StrategyCatalog(
    object(
      jsonDecode(await rootBundle.loadString('assets/strategy/catalog.json')),
    ),
  );
  List<dynamic> get brands => items(object(data['workspace'])['brands']);
  Map<String, dynamic> get documents => object(data['documents']);
  Map<String, dynamic> get assets => object(data['assets']);
  Map<String, dynamic> profile(String brand, String product) =>
      object(object(object(data['profiles'])[brand])[product]);
  Map<String, dynamic> scope(String brand, String product, String type) =>
      object(
        object(object(object(data['resourceScopes'])[brand])[product])[type],
      );
  String? resolve(
    String path, {
    String base = '',
    String brand = '',
    String product = '',
    bool asset = false,
  }) {
    final source = asset ? assets : documents;
    final decoded = Uri.decodeFull(path.split('#').first);
    final scoped = scope(brand, product, asset ? 'assets' : 'documents');
    final relative = Uri.parse(base).resolve(decoded).toString();
    for (final candidate in [
      scoped[decoded],
      decoded,
      Uri.decodeFull(relative),
      object(data['pathAliases'])[decoded],
    ]) {
      if (candidate is String && source.containsKey(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  String? source(
    Map<String, dynamic> brand,
    Map<String, dynamic> product,
    String key,
  ) {
    final strategy = object(
      object(object(product['stages'])['strategy'])['documents'],
    );
    return (strategy[key] ??
            object(product['brandDocuments'])[key] ??
            object(brand['documents'])[key])
        as String?;
  }

  String body(String? path) => text(object(documents[path])['body']);
  String section(String? path, String pattern) {
    final bodyText = body(path);
    if (pattern.isEmpty) return bodyText;
    final lines = bodyText.split('\n');
    final output = <String>[];
    final match = RegExp(pattern);
    int? level;
    for (final line in lines) {
      final heading = RegExp(r'^(#{1,6})\s+(.+)$').firstMatch(line);
      if (heading != null) {
        final depth = heading[1]!.length;
        if (level != null && depth <= level) level = null;
        if (level == null && match.hasMatch(heading[2]!)) level = depth;
      }
      if (level != null) output.add(line);
    }
    return output.join('\n');
  }
}
