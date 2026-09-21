Map<String, dynamic> objectMap(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

class HappierMachine {
  HappierMachine({
    required this.id,
    required this.host,
    required this.home,
    required this.online,
    required this.activeAt,
    this.recentAt = 0,
    List<String>? directories,
  }) : directories = directories ?? [];
  final String id, host, home;
  final bool online;
  final int activeAt;
  int recentAt;
  final List<String> directories;
}

/// Prefer the owner's last choice while it is online, then recent session use.
HappierMachine? chooseMachine(
  List<HappierMachine> machines,
  String? preferred,
) {
  final online = machines.where((m) => m.online).toList();
  for (final m in online) {
    if (m.id == preferred) return m;
  }
  online.sort((a, b) {
    final recent = b.recentAt.compareTo(a.recentAt);
    return recent != 0 ? recent : b.activeAt.compareTo(a.activeAt);
  });
  return online.isEmpty ? null : online.first;
}

bool isAbsoluteRemotePath(String path) =>
    path.isNotEmpty &&
    !path.contains(RegExp(r'[\x00-\x1f]')) &&
    (path.startsWith('/') ||
        RegExp(r'^[A-Za-z]:[\\/]').hasMatch(path) ||
        RegExp(r'^\\\\[^\\]+\\[^\\]+').hasMatch(path));

class HappierModel {
  HappierModel(this.id, this.label, this.efforts, this.defaultEffort);
  final String id, label, defaultEffort;
  final List<String> efforts;
  static List<HappierModel> parse(dynamic raw) {
    final result = <HappierModel>[];
    for (final item in objectMap(raw)['availableModels'] as List? ?? []) {
      final m = objectMap(item);
      Map<String, dynamic> option = {};
      for (final o in m['modelOptions'] as List? ?? []) {
        if (objectMap(o)['id'] == 'reasoning_effort') option = objectMap(o);
      }
      final efforts = (option['options'] as List? ?? [])
          .map((o) => objectMap(o)['value'])
          .whereType<String>()
          .toList();
      if (m['id'] is String && efforts.isNotEmpty) {
        final current = option['currentValue'];
        result.add(
          HappierModel(
            m['id'],
            m['name'] ?? m['id'],
            efforts,
            efforts.contains(current) ? current : efforts.first,
          ),
        );
      }
    }
    return result;
  }
}

class HappierRun {
  HappierRun(this.data);
  final Map<String, dynamic> data;
  String get id => data['id'];
  String get label => data['label'];
  String get machineId => data['machineId'];
  String? get sessionId => data['sessionId'];
  String get state => data['state'];
  String get progress => data['progress'] ?? '';
  String get result => data['result'] ?? '';
  bool get finished => state == 'completed' || state == 'failed';
  DateTime get createdAt => DateTime.parse(data['createdAt']);
}

({String result, bool ready, bool failed}) readHappierTranscript(
  List<dynamic> contents,
) {
  var result = '', ready = false, failed = false;
  for (final item in contents) {
    final message = objectMap(item);
    final content = objectMap(message['content']);
    final data = objectMap(content['data']);
    if (message['role'] == 'agent' &&
        content['type'] == 'acp' &&
        data['type'] == 'message' &&
        data['message'] is String) {
      result = data['message'];
      ready = false;
    }
    if (message['role'] == 'agent') {
      if (content['type'] == 'event' &&
          ['ready', 'task_complete', 'turn_complete'].contains(data['type'])) {
        ready = true;
      }
      if (['error', 'task_failed', 'turn_aborted'].contains(data['type'])) {
        failed = true;
      }
    }
  }
  return (result: result, ready: ready, failed: failed);
}
