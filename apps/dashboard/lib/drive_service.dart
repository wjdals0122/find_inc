import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;

import 'drive_config.dart';

class DriveFile {
  DriveFile(
    this.id,
    this.name,
    this.mime,
    this.parent, {
    this.size = 0,
    this.thumbnail = '',
    this.modified,
  });
  factory DriveFile.fromJson(Map<String, dynamic> j, String parent) =>
      DriveFile(
        j['id'] as String,
        j['name'] as String,
        j['mimeType'] as String,
        parent,
        size: int.tryParse('${j['size']}') ?? 0,
        thumbnail: j['thumbnailLink'] as String? ?? '',
        modified: DateTime.tryParse('${j['modifiedTime']}'),
      );
  final String id, name, mime, parent, thumbnail;
  final int size;
  final DateTime? modified;
  bool get isFolder => mime == 'application/vnd.google-apps.folder';
  bool get isImage => mime.startsWith('image/');
  bool get isVideo => mime.startsWith('video/');
  Uri get url => Uri.https(
    'drive.google.com',
    isFolder ? '/drive/folders/$id' : '/file/d/$id/view',
  );
}

class DriveFailure implements Exception {
  DriveFailure(this.message);
  final String message;
  @override
  String toString() => message;
}

class DriveService extends ChangeNotifier {
  static Future<void>? _initialization;
  final _google = GoogleSignIn.instance;
  http.Client _http = http.Client();
  StreamSubscription<GoogleSignInAuthenticationEvent>? _authEvents;
  Timer? _expiry;
  String? _token;
  GoogleSignInAccount? account;
  bool ready = false, busy = false, _disposed = false;
  String? error;
  DateTime? updated;
  List<DriveFile> files = [];
  int _generation = 0;
  final _thumbs = <String, Future<Uint8List>>{};
  bool get connected => _token != null;
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> initialize() async {
    try {
      _initialization ??= _google
          .initialize(
            clientId: kIsWeb
                ? DriveConfig.webClientId
                : defaultTargetPlatform == TargetPlatform.iOS
                ? DriveConfig.iosClientId
                : null,
            serverClientId: kIsWeb ? null : DriveConfig.webClientId,
          )
          .catchError((Object e) {
            _initialization = null;
            throw e;
          });
      await _initialization;
      if (_disposed) return;
      _authEvents ??= _google.authenticationEvents.listen(
        (event) {
          if (_disposed) return;
          if (event is GoogleSignInAuthenticationEventSignIn) {
            if (account != null && account!.id != event.user.id) _clear();
            account = event.user;
            _notify();
          } else if (event is GoogleSignInAuthenticationEventSignOut) {
            _clear();
            account = null;
            _notify();
          }
        },
        onError: (Object e) {
          error = _authError(e);
          _notify();
        },
      );
      ready = true;
      error = null;
    } catch (e) {
      if (!_disposed) error = _authError(e);
    }
    _notify();
  }

  String _authError(Object e) {
    if (e is GoogleSignInException) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        return 'Google 연결을 취소했습니다. 다시 연결할 수 있습니다.';
      }
      if (e.code == GoogleSignInExceptionCode.clientConfigurationError) {
        return 'Google 앱 등록 정보를 확인해주세요. 패키지 ID와 서명 SHA-1 또는 iOS 클라이언트 설정이 일치해야 합니다.';
      }
    }
    return 'Google 연결을 완료하지 못했습니다. 네트워크와 계정 접근 권한을 확인해주세요.';
  }

  Future<void> connect() async {
    if (busy || _disposed) return;
    busy = true;
    error = null;
    _notify();
    final run = _generation;
    try {
      if (!ready) await initialize();
      if (!ready || _disposed || run != _generation) return;
      if (account == null) {
        if (!_google.supportsAuthenticate()) {
          throw DriveFailure('먼저 Google 계정으로 연결한 뒤 Drive 권한을 허용해주세요.');
        }
        account = await _google.authenticate(scopeHint: DriveConfig.scopes);
      }
      if (_disposed || run != _generation) return;
      final auth =
          await account!.authorizationClient.authorizationForScopes(
            DriveConfig.scopes,
          ) ??
          await account!.authorizationClient.authorizeScopes(
            DriveConfig.scopes,
          );
      if (_disposed || run != _generation) return;
      _token = auth.accessToken;
      _expiry?.cancel();
      _expiry = Timer(
        const Duration(minutes: 55),
        () => disconnect(message: '연결 시간이 만료됐습니다. Google Drive를 다시 연결해주세요.'),
      );
    } catch (e) {
      if (!_disposed && run == _generation) {
        error = e is DriveFailure ? e.message : _authError(e);
      }
    } finally {
      if (!_disposed && run == _generation) {
        busy = false;
        _notify();
      }
    }
    if (connected && !_disposed && run == _generation) await refresh();
  }

  void _clear() {
    _generation++;
    _expiry?.cancel();
    _token = null;
    files = [];
    updated = null;
    busy = false;
    _clearThumbnails();
    _http.close();
    if (!_disposed) _http = http.Client();
  }

  void disconnect({String? message}) {
    _clear();
    account = null;
    error = message;
    _notify();
    if (ready) unawaited(_google.signOut().catchError((Object _) {}));
  }

  Future<http.StreamedResponse> _request(Uri uri, {int redirects = 0}) async {
    final host = uri.host;
    final trusted = [
      'googleapis.com',
      'googleusercontent.com',
      'google.com',
    ].any((d) => host == d || host.endsWith('.$d'));
    if (uri.scheme != 'https' || !trusted) {
      throw DriveFailure('신뢰할 수 없는 파일 주소입니다.');
    }
    final token = _token;
    if (token == null) throw DriveFailure('Google Drive를 다시 연결해주세요.');
    final req = http.Request('GET', uri)
      ..followRedirects = false
      ..headers['Authorization'] = 'Bearer $token';
    final response = await _http.send(req).timeout(const Duration(seconds: 30));
    if (response.statusCode >= 300 &&
        response.statusCode < 400 &&
        redirects < 3) {
      final location = response.headers['location'];
      await response.stream.drain<void>();
      if (location != null) {
        return _request(uri.resolve(location), redirects: redirects + 1);
      }
    }
    if (response.statusCode == 401) {
      disconnect(message: 'Google 연결이 만료됐습니다. 다시 연결해주세요.');
      throw DriveFailure('Google Drive를 다시 연결해주세요.');
    }
    if (response.statusCode != 200) {
      await response.stream.drain<void>();
      throw DriveFailure(switch (response.statusCode) {
        403 => '폴더 접근 권한이 없거나 Drive API 사용이 제한됐습니다. 연결한 계정과 API 설정을 확인해주세요.',
        404 => '폴더 또는 파일을 찾을 수 없습니다. 접근 권한을 확인해주세요.',
        _ => 'Drive 자료를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
      });
    }
    return response;
  }

  Future<Uint8List> _bytes(Uri uri, int limit) async {
    final run = _generation;
    final r = await _request(uri);
    if ((r.contentLength ?? 0) > limit) {
      await r.stream.take(0).drain<void>();
      throw DriveFailure('파일이 너무 큽니다. Drive에서 열어주세요.');
    }
    final output = BytesBuilder(copy: false);
    int count = 0;
    await for (final chunk in r.stream.timeout(const Duration(seconds: 30))) {
      if (_disposed || run != _generation) {
        throw DriveFailure('Google Drive를 다시 연결해주세요.');
      }
      count += chunk.length;
      if (count > limit) throw DriveFailure('파일이 너무 큽니다. Drive에서 열어주세요.');
      output.add(chunk);
    }
    if (_disposed || run != _generation) {
      throw DriveFailure('Google Drive를 다시 연결해주세요.');
    }
    return output.takeBytes();
  }

  Future<void> refresh() async {
    if (busy || !connected || _disposed) return;
    busy = true;
    error = null;
    _clearThumbnails();
    _notify();
    final run = ++_generation;
    final next = <String, DriveFile>{};
    final queue = Queue<String>()..add(DriveConfig.rootId);
    final visited = <String>{};
    try {
      while (queue.isNotEmpty) {
        final parent = queue.removeFirst();
        if (!visited.add(parent)) continue;
        String? page;
        do {
          final uri = Uri.https('www.googleapis.com', '/drive/v3/files', {
            'q': "'$parent' in parents and trashed = false",
            'pageSize': '1000',
            'fields': 'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,thumbnailLink)',
            'supportsAllDrives': 'true',
            'includeItemsFromAllDrives': 'true',
            'pageToken': ?page,
          });
          final data = jsonDecode(
            utf8.decode(await _bytes(uri, 16 * 1024 * 1024)),
          ) as Map<String, dynamic>;
          if (_disposed || run != _generation) return;
          if (data['incompleteSearch'] == true) {
            throw DriveFailure('일부 자료가 누락되었습니다. 새로고침으로 다시 시도해주세요.');
          }
          for (final value in (data['files'] as List? ?? [])) {
            final f = DriveFile.fromJson(
              Map<String, dynamic>.from(value as Map),
              parent,
            );
            next[f.id] = f;
            if (f.isFolder) queue.add(f.id);
          }
          page = data['nextPageToken'] as String?;
        } while (page != null && page.isNotEmpty);
      }
      files = next.values.toList()
        ..sort((a, b) {
          final folder = (b.isFolder ? 1 : 0) - (a.isFolder ? 1 : 0);
          return folder != 0
              ? folder
              : a.name.toLowerCase().compareTo(b.name.toLowerCase());
        });
      updated = DateTime.now();
    } catch (e) {
      if (!_disposed && run == _generation) {
        error = e is DriveFailure
            ? e.message
            : 'Drive를 불러오지 못했습니다. 네트워크를 확인하고 새로고침해주세요.';
      }
    } finally {
      if (!_disposed && run == _generation) {
        busy = false;
        _notify();
      }
    }
  }

  Future<Uint8List> thumbnail(DriveFile file) {
    final cached = _thumbs[file.id];
    if (cached != null) return cached;
    if (_thumbs.length >= 40) {
      _evictImage(_thumbs.remove(_thumbs.keys.first)!);
    }
    return _thumbs.putIfAbsent(
      file.id,
      () => _bytes(Uri.parse(file.thumbnail), 2 * 1024 * 1024),
    );
  }

  void _evictImage(Future<Uint8List> future) {
    unawaited(
      future.then<void>((bytes) {
        unawaited(MemoryImage(bytes).evict());
      }, onError: (Object _, StackTrace _) {}),
    );
  }

  void _clearThumbnails() {
    for (final future in _thumbs.values) {
      _evictImage(future);
    }
    _thumbs.clear();
  }

  Future<Uint8List> media(DriveFile file) {
    if (!files.any((f) => f.id == file.id)) {
      throw DriveFailure('현재 폴더 목록에 없는 파일입니다.');
    }
    if (file.size > 250 * 1024 * 1024) {
      throw DriveFailure('250 MB를 넘는 파일은 Drive에서 열어주세요.');
    }
    return _bytes(
      Uri.https('www.googleapis.com', '/drive/v3/files/${file.id}', {
        'alt': 'media',
        'supportsAllDrives': 'true',
      }),
      250 * 1024 * 1024,
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _authEvents?.cancel();
    final wasReady = ready;
    _clear();
    if (wasReady) unawaited(_google.signOut().catchError((Object _) {}));
    super.dispose();
  }
}
