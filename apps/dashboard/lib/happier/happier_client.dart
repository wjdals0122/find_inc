import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import 'happier_crypto.dart';
import 'happier_models.dart';
import 'happier_transport.dart';

abstract class HappierVault {
  Future<Map<String, dynamic>> load();
  Future<void> save(Map<String, dynamic> value);
}

class HappierPairing {
  HappierPairing(
    this.secret,
    this.public,
    this.claim,
    this.pairingSecret,
    this.createdAt,
    this.expiresAt,
  );
  final Uint8List secret, public, claim, pairingSecret;
  final int createdAt, expiresAt;
  Uri get url =>
      Uri.parse('https://cloud.happier.dev/terminal/connect').replace(
        fragment: Uri(
          queryParameters: {
            'key': HappierCrypto.url64(public),
            'server': HappierClient.cloud,
            'pairingSecret': HappierCrypto.url64(pairingSecret),
            'createdAt': '$createdAt',
            'expiresAt': '$expiresAt',
          },
        ).query,
      );
}

class HappierClient {
  HappierClient({
    required this.vault,
    http.Client? httpClient,
    HappierTransport Function()? transportFactory,
  }) : _http = httpClient ?? http.Client(),
       _transportFactory = transportFactory ?? HappierSocket.new;
  static const cloud = 'https://api.happier.dev';
  final HappierVault vault;
  final http.Client _http;
  final HappierTransport Function() _transportFactory;
  HappierTransport? _transport;
  String? _token, _preferred;
  Uint8List? _contentKey;
  final _machineKeys = <String, Uint8List>{};
  final _folders = <String, String>{};
  final _starting = <String>{};
  final List<HappierRun> runs = [];
  List<HappierMachine> machines = [];
  List<HappierModel> models = [];
  HappierMachine? machine;
  String? directory;
  HappierPairing? pairing;
  bool ready = false, closed = false;
  Future<void> _saving = Future.value();
  bool get authorized => _token != null && _contentKey != null;

  void _open() {
    if (closed) throw StateError('Happier 연결이 종료되었습니다.');
  }

  Future<void> restore() async {
    final stored = await vault.load();
    _open();
    _token = stored['token'];
    final key = stored['contentKey'];
    if (key is String) _contentKey = HappierCrypto.bytes(key);
    _preferred = stored['machineId'];
    _folders.addAll(Map<String, String>.from(stored['folders'] ?? {}));
    for (final value in stored['runs'] as List? ?? []) {
      runs.add(HappierRun(objectMap(value)));
    }
    // Restoring history never creates a session or resends a prompt.
  }

  Future<void> _persist() async {
    if (closed) return;
    final snapshot = jsonDecode(
      jsonEncode({
        'token': _token,
        'contentKey': _contentKey == null
            ? null
            : HappierCrypto.b64(_contentKey!),
        'machineId': _preferred,
        'folders': _folders,
        'runs': runs.take(50).map((r) => r.data).toList(),
      }),
    ) as Map<String, dynamic>;
    final next = _saving.catchError((Object _) {}).then((_) async {
      if (!closed) await vault.save(snapshot);
    });
    _saving = next;
    await next;
  }

  Future<dynamic> request(
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
  }) async {
    _open();
    if (auth && !authorized) throw StateError('Happier 연결을 먼저 승인해주세요.');
    final headers = {
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (auth) 'Authorization': 'Bearer $_token',
    };
    http.Response response;
    try {
      final uri = Uri.parse('$cloud$path');
      response =
          await (body == null
                  ? _http.get(uri, headers: headers)
                  : _http.post(uri, headers: headers, body: jsonEncode(body)))
              .timeout(const Duration(seconds: 18));
    } on TimeoutException {
      throw StateError('Happier 응답이 늦습니다. 잠시 후 다시 확인해주세요.');
    }
    _open();
    if (response.statusCode == 401 && auth) {
      await disconnect();
      throw StateError('Happier 승인이 만료되었습니다. 다시 연결해주세요.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError(
        response.statusCode == 429
            ? '요청이 많습니다. 잠시 후 다시 확인해주세요.'
            : 'Happier 요청에 실패했습니다 (${response.statusCode}).',
      );
    }
    return jsonDecode(response.body);
  }

  Future<HappierPairing> startPairing() async {
    final secret = HappierCrypto.random(32), claim = HappierCrypto.random(32);
    final public = HappierCrypto.publicKey(secret),
        pairingSecret = HappierCrypto.random(32);
    final createdAt = DateTime.now().millisecondsSinceEpoch;
    final response = objectMap(
      await request(
        '/v1/auth/request',
        auth: false,
        body: {
          'publicKey': HappierCrypto.b64(public),
          'supportsV2': true,
          'supportsTokenOnly': false,
          'claimSecretHash': HappierCrypto.url64(
            await HappierCrypto.sha256(claim),
          ),
        },
      ),
    );
    final serverExpiry =
        (response['expiresAt'] as num?)?.toInt() ?? createdAt + 600000;
    final expiry = serverExpiry < createdAt + 600000
        ? serverExpiry
        : createdAt + 600000;
    pairing = HappierPairing(
      secret,
      public,
      claim,
      pairingSecret,
      createdAt,
      expiry,
    );
    return pairing!;
  }

  Future<bool> checkPairing() async {
    final p = pairing;
    if (p == null) return authorized;
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now > p.expiresAt) {
      pairing = null;
      throw StateError('연결 승인 시간이 지났습니다. Happier 연결을 다시 눌러주세요.');
    }
    final status = objectMap(
      await request(
        '/v1/auth/request/status?publicKey=${Uri.encodeComponent(HappierCrypto.b64(p.public))}',
        auth: false,
      ),
    );
    if (status['status'] != 'authorized') return false;
    final claim = objectMap(
      await request(
        '/v1/auth/request/claim',
        auth: false,
        body: {
          'publicKey': HappierCrypto.b64(p.public),
          'claimSecret': HappierCrypto.url64(p.claim),
        },
      ),
    );
    if (claim['state'] != 'authorized') return false;
    final key = await HappierCrypto.openApproval(
      response: claim['response'],
      secret: p.secret,
      public: p.public,
      pairingSecret: p.pairingSecret,
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      now: DateTime.now().millisecondsSinceEpoch,
    );
    _open();
    if (!identical(pairing, p)) return false;
    if (claim['token'] is! String || (claim['token'] as String).isEmpty) {
      throw StateError('Happier 승인 토큰을 확인하지 못했습니다.');
    }
    _contentKey = key;
    _token = claim['token'];
    pairing = null;
    await _persist();
    return true;
  }

  Future<void> disconnect() async {
    _transport?.close();
    _transport = null;
    _token = null;
    _contentKey = null;
    pairing = null;
    ready = false;
    _machineKeys.clear();
    _folders.clear();
    _preferred = null;
    machines = [];
    models = [];
    machine = null;
    directory = null;
    runs.clear();
    await _persist();
  }

  Future<dynamic> rpc(
    String target,
    String method,
    Map<String, dynamic> payload, {
    Duration timeout = const Duration(seconds: 20),
  }) async {
    _open();
    if (!authorized) throw StateError('Happier 연결을 먼저 승인해주세요.');
    final key = _machineKeys[target];
    if (key == null) throw StateError('실행 PC의 암호화 키를 다시 확인해주세요.');
    final transport = _transport ??= _transportFactory();
    await transport.connect(_token!);
    final cipher = await HappierCrypto.encrypt(payload, key);
    _open();
    final packet = objectMap(
      await transport.call({
        'method': '$target:$method',
        'params': cipher,
        'timeoutMs': timeout.inMilliseconds,
      }, timeout),
    );
    _open();
    if (packet['ok'] != true) {
      throw StateError('PC에 연결하지 못했습니다. Happier 실행 상태를 확인해주세요.');
    }
    final encrypted = packet['result'] is List
        ? (packet['result'] as List).first
        : packet['result'];
    final decoded = await HappierCrypto.decrypt(encrypted as String, key);
    final result = objectMap(decoded);
    if (result['error'] != null || result['errorCode'] != null) {
      throw StateError('실행 PC가 요청을 처리하지 못했습니다. Happier에서 상태를 확인해주세요.');
    }
    return decoded;
  }

  Future<void> discover() async {
    ready = false;
    models = [];
    final response = await request('/v1/machines');
    final list = response is List
        ? response
        : objectMap(response)['machines'] as List? ?? [];
    final found = <HappierMachine>[];
    _machineKeys.clear();
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final value in list) {
      final row = objectMap(value);
      if (row['revokedAt'] != null || row['replacedByMachineId'] != null) {
        continue;
      }
      try {
        final key = await HappierCrypto.rowKey(row, _contentKey!);
        final metadata = objectMap(
          await HappierCrypto.decrypt(row['metadata'], key),
        );
        final activeAt = (row['activeAt'] as num?)?.toInt() ?? 0;
        found.add(
          HappierMachine(
            id: row['id'],
            host: metadata['host'] ?? '실행 PC',
            home: metadata['homeDir'] ?? '',
            activeAt: activeAt,
            online: row['active'] == true && now - activeAt < 90000,
          ),
        );
        _machineKeys[row['id']] = key;
      } catch (_) {
        _open();
        /* Other legacy or unshared devices are not usable. */
      }
    }
    machines = found;
    // Recent folders are decrypted locally; shared sessions cannot select another machine.
    final sessions =
        objectMap(await request('/v2/sessions?limit=200'))['sessions']
            as List? ??
        [];
    final recent = <({HappierMachine machine, String path, int at})>[];
    for (final value in sessions) {
      final row = objectMap(value);
      if (row['encryptionMode'] == 'plain') continue;
      try {
        final key = await HappierCrypto.rowKey(row, _contentKey!);
        final metadata = objectMap(
          await HappierCrypto.decrypt(row['metadata'], key),
        );
        final matches = found.where(
          (m) =>
              metadata['machineId'] == m.id ||
              (metadata['machineId'] == null && metadata['host'] == m.host),
        );
        final path = metadata['path'];
        if (matches.length != 1 ||
            path is! String ||
            !isAbsoluteRemotePath(path)) {
          continue;
        }
        recent.add((
          machine: matches.first,
          path: path,
          at: (row['updatedAt'] as num?)?.toInt() ?? 0,
        ));
      } catch (_) {
        _open();
        /* Ignore sessions whose keys are unavailable. */
      }
    }
    recent.sort((a, b) => b.at.compareTo(a.at));
    for (final entry in recent) {
      if (!entry.machine.directories.contains(entry.path)) {
        entry.machine.directories.add(entry.path);
      }
      if (entry.at > entry.machine.recentAt) entry.machine.recentAt = entry.at;
    }
    _open();
    machine = chooseMachine(found, _preferred);
    if (machine == null) {
      throw StateError(
        found.isEmpty
            ? '같은 Happier 계정에 등록된 PC가 없습니다. 실행 PC에서 Happier를 연결해주세요.'
            : '온라인인 실행 PC가 없습니다. PC에서 Happier daemon을 실행한 뒤 다시 확인해주세요.',
      );
    }
    _setDirectory(machine!);
    await _persist();
    await verifyTarget();
  }

  void _setDirectory(HappierMachine selected) {
    _preferred = selected.id;
    directory =
        _folders[selected.id] ??
        (selected.directories.isNotEmpty
            ? selected.directories.first
            : selected.home);
    if (isAbsoluteRemotePath(directory ?? '')) {
      _folders[selected.id] = directory!;
    }
  }

  Future<void> selectTarget(String machineId, String path) async {
    if (!isAbsoluteRemotePath(path.trim())) {
      throw StateError('PC의 전체 폴더 경로를 입력해주세요.');
    }
    final selected = machines.firstWhere((m) => m.id == machineId);
    if (!selected.online) throw StateError('온라인인 PC를 선택해주세요.');
    ready = false;
    models = [];
    machine = selected;
    directory = path.trim();
    _preferred = machineId;
    _folders[machineId] = directory!;
    await _persist();
    await verifyTarget();
  }

  Future<void> verifyTarget() async {
    ready = false;
    models = [];
    final selected = machine;
    if (selected == null || !isAbsoluteRemotePath(directory ?? '')) {
      throw StateError('실행 PC와 작업 폴더를 확인해주세요.');
    }
    final described = objectMap(
      await rpc(selected.id, 'capabilities.describe', {}),
    );
    if (described['protocolVersion'] != 1) {
      throw StateError('실행 PC의 Happier를 업데이트해주세요.');
    }
    final detected = objectMap(
      await rpc(selected.id, 'capabilities.detect', {
        'requests': [
          {
            'id': 'cli.codex',
            'params': {'includeLoginStatus': true},
          },
        ],
        'bypassCache': true,
      }),
    );
    final codex = objectMap(objectMap(detected['results'])['cli.codex']);
    final data = objectMap(codex['data']);
    if (codex['ok'] != true ||
        data['available'] != true ||
        !(objectMap(data['authStatus'])['state'] == 'logged_in' ||
            data['isLoggedIn'] == true)) {
      throw StateError('실행 PC의 Codex 로그인을 확인해주세요.');
    }
    final probe = objectMap(
      await rpc(selected.id, 'capabilities.invoke', {
        'id': 'cli.codex',
        'method': 'probeModels',
        'params': {
          'backendTarget': {'kind': 'builtInAgent', 'agentId': 'codex'},
          'codexBackendMode': 'appServer',
          'directory': directory,
        },
      }, timeout: const Duration(seconds: 30)),
    );
    if (probe['ok'] != true ||
        objectMap(probe['result'])['source'] == 'static') {
      throw StateError('실행 PC의 실제 모델 목록을 가져오지 못했습니다.');
    }
    models = HappierModel.parse(probe['result']);
    if (models.isEmpty) throw StateError('사용 가능한 Codex 모델이 없습니다.');
    _open();
    ready = true;
  }

  Future<HappierRun> createRun({
    required String skill,
    required String label,
    required String model,
    required String effort,
    required String instruction,
    required bool apply,
  }) async {
    if (!ready || machine == null) {
      throw StateError('Happier 연결 상태를 먼저 확인해주세요.');
    }
    if (!RegExp(r'^[a-z0-9][a-z0-9-]*$').hasMatch(skill) ||
        instruction.trim().isEmpty ||
        instruction.length > 8000 ||
        !models.any((m) => m.id == model && m.efforts.contains(effort))) {
      throw StateError('스킬, 모델, 요청 내용을 확인해주세요.');
    }
    final now = DateTime.now().toIso8601String();
    final run = HappierRun({
      'id': const Uuid().v4(),
      'skill': skill,
      'label': label,
      'model': model,
      'effort': effort,
      'instruction': instruction.trim(),
      'apply': apply,
      'machineId': machine!.id,
      'host': machine!.host,
      'directory': directory,
      'createdAt': now,
      'updatedAt': now,
      'state': 'checking',
      'progress': '실행 PC 확인 중',
      'result': '',
      'attempts': 0,
    });
    runs.insert(0, run);
    await _persist(); // Persist the nonce before any mutating RPC.
    await startRun(run);
    return run;
  }

  Future<Map<String, dynamic>> _resolve(HappierRun run) async => objectMap(
    await rpc(run.machineId, 'daemon.spawnSession.resolve', {
      'spawnNonce': run.id,
    }),
  );

  Map<String, dynamic> _payload(HappierRun run) {
    final r = run.data, now = DateTime.now().millisecondsSinceEpoch;
    final prompt =
        '프로젝트 ${r['directory']}의 AGENTS.md와 .agents/skills/${r['skill']}/SKILL.md를 찾아 읽고 '
        '\$${r['skill']} 스킬을 적용하세요.\n사용자 요청: ${r['instruction']}\n'
        '기존 프로젝트·인증·다른 산출물을 보존하고 비밀값을 출력하지 마세요. '
        '작업에 필요한 사용자 확인과 외부 게시 승인 조건은 해당 스킬을 따르세요. '
        '결과 파일과 성공·실패·확인 필요 항목을 마지막 응답에 남기세요.\n'
        '${r['apply'] == true ? '결과가 대시보드 자료에 영향을 주면 strategy-dashboard로 기존 디자인·로그인·스킬 실행 기능과 기존 자료를 보존하며 반영하세요. 배포 승인 조건은 해당 스킬과 프로젝트 규칙을 따르세요.' : '대시보드 재생성이나 배포는 수행하지 마세요.'}';
    return {
      'type': 'spawn-in-directory',
      'directory': r['directory'],
      'backendTarget': {'kind': 'builtInAgent', 'agentId': 'codex'},
      'agent': 'codex',
      'codexBackendMode': 'appServer',
      'experimentalCodexAcp': false,
      'windowsRemoteSessionLaunchMode': 'hidden',
      'permissionMode': 'default',
      'permissionModeUpdatedAt': now,
      'modelId': r['model'],
      'modelUpdatedAt': now,
      'spawnNonce': run.id,
      'connectedServices': {
        'v': 1,
        'bindingsByServiceId': {
          'openai-codex': {'source': 'native'},
          'openai': {'source': 'native'},
        },
      },
      'sessionConfigOptionOverrides': {
        'v': 1,
        'updatedAt': now,
        'overrides': {
          'reasoning_effort': {'updatedAt': now, 'value': r['effort']},
        },
      },
      'pendingFirstInput': {
        'text': prompt,
        'localId': 'dashboard-input-${run.id}',
      },
    };
  }

  Future<void> startRun(HappierRun run) async {
    if (_starting.contains(run.id) || run.sessionId != null || run.finished) {
      return;
    }
    _starting.add(run.id);
    try {
      if (!_machineKeys.containsKey(run.machineId)) await discover();
      // An uncertain spawn is only reconciled. It is never sent a second time.
      if ((run.data['attempts'] as int) > 0) {
        final found = await _resolve(run);
        if (found['status'] == 'success' && found['sessionId'] is String) {
          run.data.addAll({
            'sessionId': found['sessionId'],
            'state': 'running',
            'progress': '기존 세션에 다시 연결했습니다.',
          });
        } else {
          run.data.addAll({
            'state': 'uncertain',
            'progress': '세션 생성 결과를 확인하지 못했습니다. Happier에서 실행 내역을 확인해주세요.',
          });
        }
        return;
      }
      run.data.addAll({
        'state': 'creating',
        'progress': '암호화된 Codex 세션을 만드는 중',
        'attempts': 1,
      });
      await _persist();
      try {
        final result = objectMap(
          await rpc(
            run.machineId,
            'spawn-happy-session',
            _payload(run),
            timeout: const Duration(seconds: 60),
          ),
        );
        if (result['type'] != 'success' || result['sessionId'] is! String) {
          throw StateError('세션 ID를 확인하지 못했습니다.');
        }
        run.data.addAll({
          'sessionId': result['sessionId'],
          'state': 'running',
          'progress': 'Codex 실행 중',
        });
      } catch (_) {
        final found = await _resolve(run);
        if (found['status'] == 'success' && found['sessionId'] is String) {
          run.data.addAll({
            'sessionId': found['sessionId'],
            'state': 'running',
            'progress': '생성된 세션에 연결했습니다.',
          });
        } else {
          run.data.addAll({
            'state': 'uncertain',
            'progress': '세션 생성 결과 확인이 필요합니다. 다시 연결하거나 Happier에서 확인해주세요.',
          });
        }
      }
    } catch (_) {
      run.data.addAll({
        'state': (run.data['attempts'] as int) > 0 ? 'uncertain' : 'failed',
        'progress': '실행 PC와 연결하지 못했습니다. 연결을 확인한 뒤 실행 내역을 다시 확인해주세요.',
      });
    } finally {
      _starting.remove(run.id);
      run.data['updatedAt'] = DateTime.now().toIso8601String();
      await _persist();
    }
  }

  Future<void> refreshRun(HappierRun run) async {
    if (run.finished) return;
    if (run.sessionId == null) {
      // Checking a saved run can resolve an existing spawn, never create a new one.
      if ((run.data['attempts'] as int) > 0) {
        await startRun(run);
      } else {
        run.data.addAll({
          'state': 'failed',
          'progress': '전송 전에 중단된 요청입니다. 새 작업으로 실행해주세요.',
        });
        await _persist();
      }
      return;
    }
    try {
      final id = Uri.encodeComponent(run.sessionId!);
      final response = objectMap(await request('/v2/sessions/$id'));
      final session = objectMap(response['session'] ?? response);
      final key = await HappierCrypto.rowKey(session, _contentKey!);
      final page = objectMap(
        await request('/v1/sessions/$id/messages?scope=main&limit=100'),
      );
      final records = (page['messages'] as List? ?? []).map(objectMap).toList()
        ..sort(
          (a, b) =>
              ((a['seq'] as num?) ?? 0).compareTo((b['seq'] as num?) ?? 0),
        );
      final contents = <dynamic>[];
      for (final record in records) {
        final content = objectMap(record['content']);
        if (content['t'] == 'encrypted') {
          contents.add(await HappierCrypto.decrypt(content['c'], key));
        }
      }
      final read = readHappierTranscript(contents);
      final agent = session['agentState'] == null
          ? <String, dynamic>{}
          : objectMap(await HappierCrypto.decrypt(session['agentState'], key));
      final pending = objectMap(agent['requests']).isNotEmpty;
      if (read.result.isNotEmpty) run.data['result'] = read.result;
      run.data.addAll({
        'state': pending ? 'awaiting_approval' : 'running',
        'progress': pending ? 'Happier에서 승인이 필요합니다.' : '암호화된 Codex 응답 수신 중',
      });
      if (read.failed) {
        run.data.addAll({
          'state': 'failed',
          'progress': 'Codex가 오류 또는 중단을 보고했습니다.',
        });
      } else if (read.ready && read.result.isNotEmpty && !pending) {
        run.data.addAll({'state': 'completed', 'progress': '작업 완료'});
      }
    } catch (_) {
      run.data.addAll({
        'state': 'disconnected',
        'progress': '세션 상태를 가져오지 못했습니다. 다시 연결해도 작업을 중복 실행하지 않습니다.',
      });
    }
    run.data['updatedAt'] = DateTime.now().toIso8601String();
    await _persist();
  }

  void close() {
    closed = true;
    ready = false;
    _transport?.close();
    _http.close();
    _token = null;
    _contentKey = null;
    pairing = null;
    _machineKeys.clear();
  }
}
