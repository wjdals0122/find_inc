import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

import 'drive_video_handle.dart';

Future<DriveVideoHandle> prepareDriveVideo(Uint8List bytes, String mime) async {
  final root = await getTemporaryDirectory();
  final directory = await Directory(root.path).createTemp('drive-preview-');
  final suffix = mime.split('/').last.replaceAll(RegExp('[^a-zA-Z0-9]'), '');
  final file = File('${directory.path}/preview.$suffix');
  VideoPlayerController? controller;
  Future<void> cleanup() async {
    if (await file.exists()) await file.delete();
    if (await directory.exists()) await directory.delete();
  }

  try {
    await file.writeAsBytes(bytes, flush: true);
    controller = VideoPlayerController.file(file);
    await controller.initialize();
    return DriveVideoHandle(controller, cleanup);
  } catch (_) {
    await controller?.dispose();
    await cleanup();
    rethrow;
  }
}
