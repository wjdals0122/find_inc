import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;
import 'package:video_player/video_player.dart';

import 'drive_video_handle.dart';

Future<DriveVideoHandle> prepareDriveVideo(Uint8List bytes, String mime) async {
  final blob = web.Blob([bytes.toJS].toJS, web.BlobPropertyBag(type: mime));
  final url = web.URL.createObjectURL(blob);
  final controller = VideoPlayerController.networkUrl(Uri.parse(url));
  try {
    await controller.initialize();
    return DriveVideoHandle(controller, () async {
      web.URL.revokeObjectURL(url);
    });
  } catch (_) {
    await controller.dispose();
    web.URL.revokeObjectURL(url);
    rethrow;
  }
}
