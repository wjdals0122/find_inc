// Pure Dart protocol/behavior checks; does not build or launch a Flutter app.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:cryptography/cryptography.dart';
import 'package:pinenacl/x25519.dart' as nacl;
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'package:dashboard/happier/happier_client.dart';
import 'package:dashboard/happier/happier_crypto.dart';
import 'package:dashboard/happier/happier_models.dart';
import 'package:dashboard/happier/happier_transport.dart';

void check(bool value, String reason) {
  if (!value) throw StateError(reason);
}

Future<void> rejects(Future<dynamic> Function() work, String reason) async {
  try {
    await work();
  } catch (_) {
    return;
  }
  throw StateError(reason);
}

class MemoryVault implements HappierVault {
  MemoryVault([this.value = const {}]);
  Map<String, dynamic> value;
  @override
  Future<Map<String, dynamic>> load() async =>
      objectMap(jsonDecode(jsonEncode(value)));
  @override
  Future<void> save(Map<String, dynamic> data) async {
    value = objectMap(jsonDecode(jsonEncode(data)));
  }
}

class FakeSocket implements HappierTransport {
  FakeSocket(this.key, this.vault);
  final Uint8List key;
  final MemoryVault vault;
  int spawns = 0;
  bool spawnTimeout = false, resolved = false;
  String? lastModelDirectory, lastTarget, nonce;
  @override
  Future<void> connect(String token) async {
    check(token == 'synthetic-token', 'wrong token');
  }

  @override
  void close() {}
  @override
  Future<dynamic> call(Map<String, dynamic> packet, Duration timeout) async {
    check(
      !jsonEncode(packet).contains('synthetic task'),
      'prompt leaked into RPC packet',
    );
    final method = packet['method'] as String;
    final payload = objectMap(
      await HappierCrypto.decrypt(packet['params'], key),
    );
    dynamic answer = {};
    if (method.endsWith(':capabilities.describe')) {
      answer = {'protocolVersion': 1};
    }
    if (method.endsWith(':capabilities.detect')) {
      answer = {
        'results': {
          'cli.codex': {
            'ok': true,
            'data': {
              'available': true,
              'authStatus': {'state': 'logged_in'},
            },
          },
        },
      };
    }
    if (method.endsWith(':capabilities.invoke')) {
      lastModelDirectory = objectMap(payload['params'])['directory'];
      answer = {
        'ok': true,
        'result': {
          'source': 'dynamic',
          'availableModels': [
            {
              'id': 'test-model',
              'name': 'Test model',
              'modelOptions': [
                {
                  'id': 'reasoning_effort',
                  'currentValue': 'medium',
                  'options': [
                    {'value': 'low'},
                    {'value': 'medium'},
                  ],
                },
              ],
            },
          ],
        },
      };
    }
    if (method.endsWith(':spawn-happy-session')) {
      spawns++;
      nonce = payload['spawnNonce'];
      lastTarget = method.split(':').first;
      check(
        (vault.value['runs'] as List).any(
          (r) => r['id'] == nonce && r['attempts'] == 1,
        ),
        'nonce was not persisted before the spawn',
      );
      check(
        payload['permissionMode'] == 'default',
        'approval mode was bypassed',
      );
      check(
        payload['windowsRemoteSessionLaunchMode'] == 'hidden',
        'remote window is not hidden',
      );
      check(
        objectMap(
          payload['pendingFirstInput'],
        )['text'].contains('synthetic task'),
        'missing input',
      );
      if (spawnTimeout) throw StateError('synthetic timeout');
      answer = {'type': 'success', 'sessionId': 'test-session'};
    }
    if (method.endsWith(':daemon.spawnSession.resolve')) {
      check(
        payload['spawnNonce'] == nonce,
        'reconciliation used a different nonce',
      );
      answer = resolved
          ? {'status': 'success', 'sessionId': 'test-session'}
          : {'status': 'pending'};
    }
    return {'ok': true, 'result': await HappierCrypto.encrypt(answer, key)};
  }
}

Future<void> checkPairing(Uint8List contentKey) async {
  final store = MemoryVault();
  late HappierClient client;
  String? claimHash;
  client = HappierClient(
    vault: store,
    httpClient: MockClient((request) async {
      check(
        !request.headers.containsKey('authorization'),
        'pairing sent a stale account token',
      );
      check(
        !request.url.toString().contains('pairingSecret'),
        'pairing secret leaked into request URL',
      );
      final body = request.body.isEmpty
          ? <String, dynamic>{}
          : objectMap(jsonDecode(request.body));
      if (request.url.path == '/v1/auth/request') {
        check(
          body['supportsV2'] == true && body['supportsTokenOnly'] == false,
          'wrong approval capabilities',
        );
        claimHash = body['claimSecretHash'];
        return http.Response(
          jsonEncode({
            'expiresAt': DateTime.now().millisecondsSinceEpoch + 600000,
          }),
          200,
        );
      }
      if (request.url.path.endsWith('/status')) {
        return http.Response('{"status":"authorized"}', 200);
      }
      check(request.url.path.endsWith('/claim'), 'wrong pairing endpoint');
      final p = client.pairing!;
      check(
        body['claimSecret'] == HappierCrypto.url64(p.claim),
        'wrong claim proof',
      );
      final ephemeral = nacl.PrivateKey.generate();
      final box = nacl.Box(
        myPrivateKey: ephemeral,
        theirPublicKey: nacl.PublicKey(p.public),
      );
      final sealed = Uint8List.fromList([
        ...ephemeral.publicKey.asTypedList,
        ...box.encrypt(Uint8List.fromList([0, ...contentKey])).asTypedList,
      ]);
      final canonical = BytesBuilder();
      for (final part in [
        utf8.encode('happier-terminal-provisioning-v3'),
        p.public,
        utf8.encode('${p.createdAt}'),
        utf8.encode('${p.expiresAt}'),
        sealed,
      ]) {
        canonical.add(
          (ByteData(
            4,
          )..setUint32(0, part.length, Endian.big)).buffer.asUint8List(),
        );
        canonical.add(part);
      }
      final mac = await Hmac.sha256().calculateMac(
        canonical.takeBytes(),
        secretKey: SecretKey(p.pairingSecret),
      );
      return http.Response(
        jsonEncode({
          'state': 'authorized',
          'token': 'synthetic-token',
          'response': HappierCrypto.b64([
            0x48,
            0x50,
            0x56,
            0x33,
            ...sealed,
            ...mac.bytes,
          ]),
        }),
        200,
      );
    }),
  );
  final p = await client.startPairing();
  check(
    p.url.query.isEmpty && p.url.fragment.contains('pairingSecret='),
    'approval proof is not confined to fragment',
  );
  check(
    claimHash == HappierCrypto.url64(await HappierCrypto.sha256(p.claim)),
    'claim commitment differs',
  );
  check(store.value.isEmpty, 'unapproved private key was persisted');
  check(
    await client.checkPairing() && client.authorized,
    'approved account was not restored',
  );
  check(
    store.value['contentKey'] == HappierCrypto.b64(contentKey),
    'wrong account content key persisted',
  );
  check(
    !jsonEncode(store.value).contains(HappierCrypto.b64(p.secret)),
    'ephemeral private key was persisted',
  );
  client.close();
  stdout.writeln(
    'Pairing request, fragment, claim proof, approval and secure-vault payload checks passed.',
  );
}

Future<void> checkSocket(Uint8List key) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  final openSockets = <WebSocket>[];
  var authorized = false;
  final subscription = server.listen((request) async {
    check(request.uri.path == '/v1/updates/', 'wrong Engine.IO path');
    check(request.uri.queryParameters['EIO'] == '4', 'wrong Engine.IO version');
    final socket = await WebSocketTransformer.upgrade(request);
    openSockets.add(socket);
    socket.add(
      '0{"sid":"engine-test","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}',
    );
    socket.listen((dynamic message) async {
      final text = message as String;
      if (text.startsWith('40')) {
        final auth = objectMap(jsonDecode(text.substring(2)));
        check(
          auth['token'] == 'synthetic-token' &&
              auth['clientType'] == 'user-scoped' &&
              auth['clientPurpose'] == 'sync',
          'wrong Socket.IO account scope',
        );
        authorized = true;
        socket.add('40{"sid":"user-test"}');
      } else if (text.startsWith('42')) {
        final match = RegExp(r'^42(\d+)(\[.*)$').firstMatch(text)!;
        final data = jsonDecode(match.group(2)!) as List;
        check(data.first == 'rpc-call', 'wrong Socket.IO RPC event');
        final packet = objectMap(data[1]);
        if (packet['method'] == 'test:timeout') return;
        final plain = objectMap(
          await HappierCrypto.decrypt(packet['params'], key),
        );
        check(
          plain['synthetic'] == true,
          'Socket.IO request was not encrypted correctly',
        );
        final encrypted = await HappierCrypto.encrypt({'verified': true}, key);
        socket.add(
          '43${match.group(1)}${jsonEncode([
            {'ok': true, 'result': encrypted},
          ])}',
        );
      }
    });
  });
  final socket = HappierSocket(
    socketFactory: (url, options) {
      check(
        url == HappierClient.cloud &&
            options['reconnection'] == false &&
            options['forceNew'] == true,
        'production socket options are not isolated',
      );
      return io.io('http://127.0.0.1:${server.port}', options);
    },
  );
  try {
    await socket.connect('synthetic-token');
    final result = objectMap(
      await socket.call({
        'method': 'test:rpc',
        'params': await HappierCrypto.encrypt({'synthetic': true}, key),
      }, const Duration(seconds: 3)),
    );
    check(
      authorized &&
          result['ok'] == true &&
          objectMap(
                await HappierCrypto.decrypt(result['result'], key),
              )['verified'] ==
              true,
      'native Socket.IO acknowledgement was not decoded',
    );
    await rejects(
      () => socket.call({
        'method': 'test:timeout',
        'params': 'ignored',
      }, const Duration(milliseconds: 100)),
      'missing Socket.IO acknowledgement did not time out',
    );
  } finally {
    socket.close();
    for (final ws in openSockets) {
      await ws.close();
    }
    await server.close(force: true);
    await subscription.cancel();
  }
  stdout.writeln(
    'Native Engine.IO/Socket.IO handshake, encrypted RPC acknowledgements and timeout checks passed.',
  );
}

Future<void> main() async {
  final app = File.fromUri(Platform.script).parent.parent;
  final f = objectMap(
    jsonDecode(
      File('${app.path}/test/fixtures/happier-wire.json').readAsStringSync(),
    ),
  );
  final key = HappierCrypto.bytes(f['dataKey']),
      contentKey = HappierCrypto.bytes(f['contentKey']);
  check(
    HappierCrypto.b64(
          HappierCrypto.publicKey(HappierCrypto.bytes(f['secret'])),
        ) ==
        f['public'],
    'Curve25519 public key differs from TweetNaCl',
  );
  Future<Uint8List> approval({
    String? value,
    Uint8List? secret,
    int? now,
    int? createdAt,
  }) => HappierCrypto.openApproval(
    response: value ?? f['approval'],
    secret: HappierCrypto.bytes(f['secret']),
    public: HappierCrypto.bytes(f['public']),
    pairingSecret: secret ?? HappierCrypto.bytes(f['pairingSecret']),
    createdAt: createdAt ?? f['createdAt'],
    expiresAt: f['expiresAt'],
    now: now ?? f['createdAt'] + 1,
  );
  check(
    HappierCrypto.b64(await approval()) == f['contentKey'],
    'official V3 approval does not open',
  );
  await rejects(
    () => approval(secret: HappierCrypto.random(32)),
    'wrong pairing secret accepted',
  );
  await rejects(
    () => approval(now: f['expiresAt'] + 1),
    'expired approval accepted',
  );
  await rejects(
    () => approval(createdAt: f['createdAt'] - 1),
    'changed pairing context accepted',
  );
  final tampered = HappierCrypto.bytes(f['approval']);
  tampered[50] ^= 1;
  await rejects(
    () => approval(value: HappierCrypto.b64(tampered)),
    'tampered approval accepted',
  );
  for (final name in ['envelope', 'seedEnvelope']) {
    check(
      HappierCrypto.b64(
            await HappierCrypto.rowKey({
              'dataEncryptionKey': f[name],
            }, contentKey),
          ) ==
          f['dataKey'],
      'official $name does not open',
    );
  }
  await rejects(
    () => HappierCrypto.rowKey({
      'encryptionMode': 'plain',
      'dataEncryptionKey': f['envelope'],
    }, contentKey),
    'plaintext session accepted',
  );
  check(
    jsonEncode(await HappierCrypto.decrypt(f['ciphertext'], key)) ==
        jsonEncode(f['value']),
    'Node AES packet does not open',
  );
  final damaged = HappierCrypto.bytes(f['ciphertext']);
  damaged.last ^= 1;
  await rejects(
    () => HappierCrypto.decrypt(HappierCrypto.b64(damaged), key),
    'damaged GCM packet accepted',
  );
  Directory('${app.path}/.dart_tool').createSync(recursive: true);
  File('${app.path}/.dart_tool/happier-dart-wire.json').writeAsStringSync(
    jsonEncode({
      'ciphertext': await HappierCrypto.encrypt(f['value'], key),
      'key': f['dataKey'],
      'value': f['value'],
    }),
  );
  stdout.writeln(
    'Official V3, NaCl data-key/seed envelopes, AES-GCM and tamper rejection passed.',
  );
  await checkPairing(contentKey);
  await checkSocket(key);

  final older = HappierMachine(
    id: 'a',
    host: 'A',
    home: '/a',
    online: true,
    activeAt: 1,
    recentAt: 9,
  );
  final newer = HappierMachine(
    id: 'b',
    host: 'B',
    home: '/b',
    online: true,
    activeAt: 2,
    recentAt: 3,
  );
  final offline = HappierMachine(
    id: 'c',
    host: 'C',
    home: '/c',
    online: false,
    activeAt: 99,
    recentAt: 99,
  );
  check(
    chooseMachine([newer, offline, older], null)?.id == 'a',
    'recent session did not choose target',
  );
  check(
    chooseMachine([older, newer], 'b')?.id == 'b',
    'saved online target not preserved',
  );
  check(
    chooseMachine([offline, older], 'c')?.id == 'a',
    'offline preferred target selected',
  );
  check(chooseMachine([offline], null) == null, 'offline machine selected');
  for (final path in [
    '/workspace/project',
    r'C:\work\project',
    r'\\server\share\project',
  ]) {
    check(isAbsoluteRemotePath(path), 'valid remote path rejected');
  }
  for (final path in ['', 'relative/path', 'C:relative', '/path\nother']) {
    check(!isAbsoluteRemotePath(path), 'unsafe/relative remote path accepted');
  }
  dynamic agent(String type, Map<String, dynamic> data) => {
    'role': 'agent',
    'content': {'type': type, 'data': data},
  };
  final transcript = [
    agent('acp', {'type': 'message', 'message': 'answer'}),
    agent('event', {'type': 'ready'}),
  ];
  check(
    readHappierTranscript(transcript).ready,
    'official ready event ignored',
  );
  check(
    !readHappierTranscript([
      ...transcript,
      agent('acp', {'type': 'message', 'message': 'next'}),
    ]).ready,
    'stale ready event completed a new turn',
  );
  check(
    readHappierTranscript([
      agent('acp', {'type': 'task_failed'}),
    ]).failed,
    'failure ignored',
  );
  stdout.writeln(
    'Recent target selection, remote paths and transcript completion checks passed.',
  );

  final store = MemoryVault({
    'token': 'synthetic-token',
    'contentKey': f['contentKey'],
  });
  final socket = FakeSocket(key, store);
  var unauthorized = false, pending = false;
  final httpClient = MockClient((request) async {
    if (unauthorized) return http.Response('{}', 401);
    check(
      request.headers['authorization'] == 'Bearer synthetic-token',
      'missing bearer token',
    );
    final now = DateTime.now().millisecondsSinceEpoch;
    dynamic answer = {};
    if (request.url.path == '/v1/machines') {
      answer = {
        'machines': [
          for (final id in ['a', 'b', 'offline'])
            {
              'id': id,
              'active': id != 'offline',
              'activeAt': now,
              'dataEncryptionKey': f['envelope'],
              'metadata': await HappierCrypto.encrypt({
                'host': id,
                'homeDir': '/home/$id',
              }, key),
            },
        ],
      };
    } else if (request.url.path == '/v2/sessions') {
      answer = {
        'sessions': [
          for (final id in ['a', 'b'])
            {
              'id': 'session-$id',
              'updatedAt': id == 'a' ? 20 : 10,
              'dataEncryptionKey': f['envelope'],
              'metadata': await HappierCrypto.encrypt({
                'machineId': id,
                'path': '/work/$id',
              }, key),
            },
        ],
      };
    } else if (request.url.path == '/v2/sessions/test-session') {
      answer = {
        'session': {
          'dataEncryptionKey': f['envelope'],
          'encryptionMode': 'e2ee',
          'agentState': await HappierCrypto.encrypt({
            'requests': pending ? {'test': {}} : {},
          }, key),
        },
      };
    } else if (request.url.path.endsWith('/messages')) {
      answer = {
        'messages': [
          for (var i = 0; i < transcript.length; i++)
            {
              'seq': i + 1,
              'content': {
                't': 'encrypted',
                'c': await HappierCrypto.encrypt(transcript[i], key),
              },
            },
        ],
      };
    } else {
      throw StateError('Unexpected API path: ${request.url.path}');
    }
    return http.Response(jsonEncode(answer), 200);
  });
  final client = HappierClient(
    vault: store,
    httpClient: httpClient,
    transportFactory: () => socket,
  );
  await client.restore();
  await client.discover();
  check(
    client.ready && client.machine?.id == 'a' && client.directory == '/work/a',
    'target discovery failed',
  );
  check(
    client.models.single.defaultEffort == 'medium',
    'actual model options not parsed',
  );
  await client.selectTarget('b', '/other/project');
  check(
    socket.lastModelDirectory == '/other/project',
    'changed directory not used for model probe',
  );
  final run = await client.createRun(
    skill: 'brand',
    label: 'Brand',
    model: 'test-model',
    effort: 'medium',
    instruction: 'synthetic task',
    apply: false,
  );
  check(
    run.sessionId == 'test-session' && socket.lastTarget == 'b',
    'spawn used wrong target',
  );
  await client.refreshRun(run);
  check(
    run.state == 'completed' && run.result == 'answer',
    'encrypted session result not read',
  );

  socket.spawnTimeout = true;
  final uncertain = await client.createRun(
    skill: 'brand',
    label: 'Brand',
    model: 'test-model',
    effort: 'medium',
    instruction: 'synthetic task',
    apply: false,
  );
  check(uncertain.state == 'uncertain', 'timeout did not preserve uncertainty');
  await client.refreshRun(uncertain);
  await client.startRun(uncertain);
  check(socket.spawns == 2, 'uncertain session was spawned twice');
  socket.resolved = true;
  await client.refreshRun(uncertain);
  check(
    uncertain.sessionId == 'test-session',
    'existing session was not recovered',
  );
  pending = true;
  await client.refreshRun(uncertain);
  check(
    uncertain.state == 'awaiting_approval',
    'pending approval not surfaced',
  );
  pending = false;
  await client.refreshRun(uncertain);
  check(uncertain.state == 'completed', 'approval recovery did not complete');
  final restored = HappierClient(vault: store);
  await restored.restore();
  check(
    restored.runs.length == 2 &&
        restored.runs.first.data['directory'] == '/other/project',
    'history or fixed target not restored',
  );
  check(!restored.ready, 'restore falsely claimed live connectivity');
  restored.close();
  check(
    !jsonEncode(store.value).contains('pairingSecret'),
    'ephemeral secret was persisted',
  );
  unauthorized = true;
  await rejects(() => client.request('/v1/machines'), '401 accepted');
  check(
    !client.authorized && store.value['token'] == null && client.runs.isEmpty,
    '401 did not clear vault',
  );
  client.close();
  stdout.writeln(
    'Encrypted RPC, Codex discovery/spawn, nonce persistence, timeout recovery, approvals, history and 401 checks passed.',
  );
}
