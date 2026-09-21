import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

abstract class HappierTransport {
  Future<void> connect(String token);
  Future<dynamic> call(Map<String, dynamic> packet, Duration timeout);
  void close();
}

class HappierSocket implements HappierTransport {
  HappierSocket({
    io.Socket Function(String, Map<String, dynamic>)? socketFactory,
  }) : _socketFactory =
           socketFactory ?? ((url, options) => io.io(url, options));
  final io.Socket Function(String, Map<String, dynamic>) _socketFactory;
  io.Socket? _socket;
  Future<void>? _connecting;
  bool _closed = false;

  @override
  Future<void> connect(String token) async {
    if (_closed) throw StateError('Happier 연결이 종료되었습니다.');
    if (_socket?.connected == true) return;
    if (_connecting != null) return _connecting;
    final future = _connect(token);
    _connecting = future;
    try {
      await future;
    } finally {
      _connecting = null;
    }
  }

  Future<void> _connect(String token) async {
    _socket?.dispose();
    final socket = _socket = _socketFactory('https://api.happier.dev', {
      'path': '/v1/updates/',
      'transports': ['websocket'],
      'auth': {
        'token': token,
        'clientType': 'user-scoped',
        'clientPurpose': 'sync',
      },
      'autoConnect': false,
      'forceNew': true,
      'multiplex': false,
      'reconnection': false,
      'withCredentials': false,
    });
    final ready = Completer<void>();
    socket.once('connect', (_) {
      if (!ready.isCompleted) ready.complete();
    });
    socket.once('connect_error', (_) {
      if (!ready.isCompleted) {
        ready.completeError(StateError('Happier 암호화 연결에 실패했습니다. 다시 확인해주세요.'));
      }
    });
    socket.connect();
    try {
      await ready.future.timeout(const Duration(seconds: 12));
      if (_closed) throw StateError('Happier 연결이 종료되었습니다.');
    } catch (_) {
      socket.dispose();
      rethrow;
    }
  }

  @override
  Future<dynamic> call(Map<String, dynamic> packet, Duration timeout) async {
    final socket = _socket;
    if (_closed || socket?.connected != true) {
      throw StateError('Happier 연결을 다시 확인해주세요.');
    }
    return socket!
        .timeout(timeout.inMilliseconds)
        .emitWithAckAsync('rpc-call', packet);
  }

  @override
  void close() {
    _closed = true;
    _socket?.dispose();
    _socket = null;
  }
}
