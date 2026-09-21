import 'package:video_player/video_player.dart';

class DriveVideoHandle {
  DriveVideoHandle(this.controller, this.cleanup);
  final VideoPlayerController controller;
  final Future<void> Function() cleanup;
  bool _disposed = false;
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    try {
      await controller.dispose();
    } finally {
      await cleanup();
    }
  }
}
