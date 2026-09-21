import 'dart:async';
import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import 'drive_service.dart';
import 'drive_video_handle.dart';
import 'drive_video_data.dart';

class DrivePreview extends StatefulWidget {
  const DrivePreview({super.key, required this.file, required this.service});
  final DriveFile file;
  final DriveService service;
  @override
  State<DrivePreview> createState() => _DrivePreviewState();
}

class _DrivePreviewState extends State<DrivePreview> {
  Future<Uint8List>? _loading;
  DriveVideoHandle? _video;
  String? _videoError;
  @override
  void initState() {
    super.initState();
    widget.service.addListener(_sessionChanged);
    if (widget.file.isImage || widget.file.isVideo) _loading = _load();
  }

  Future<Uint8List> _load() async {
    final bytes = await widget.service.media(widget.file);
    if (widget.file.isVideo) {
      try {
        final video = await prepareDriveVideo(bytes, widget.file.mime);
        if (!mounted || !widget.service.connected) {
          await video.dispose();
          throw DriveFailure('Drive 연결이 해제됐습니다.');
        }
        _video = video;
      } catch (_) {
        _videoError = '이 기기에서 영상을 재생할 수 없습니다. Drive에서 열어주세요.';
      }
      return Uint8List(0);
    }
    return bytes;
  }

  void _release() {
    final loading = _loading;
    if (loading != null) {
      unawaited(
        loading.then<void>((bytes) {
          if (bytes.isNotEmpty) unawaited(MemoryImage(bytes).evict());
        }, onError: (Object _, StackTrace _) {}),
      );
    }
    final video = _video;
    _video = null;
    if (video != null) unawaited(video.dispose().catchError((Object _) {}));
  }

  void _sessionChanged() {
    if (!widget.service.connected && mounted) {
      _release();
      setState(() => _loading = null);
    }
  }

  @override
  void dispose() {
    widget.service.removeListener(_sessionChanged);
    _release();
    super.dispose();
  }

  Future<void> _open() async {
    try {
      if (!await launchUrl(
        widget.file.url,
        mode: LaunchMode.externalApplication,
      )) {
        throw Exception();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Drive 링크를 열지 못했습니다.')));
      }
    }
  }

  Widget _videoPlayer() {
    final controller = _video!.controller;
    return ValueListenableBuilder<VideoPlayerValue>(
      valueListenable: controller,
      builder: (context, value, _) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AspectRatio(
            aspectRatio: value.aspectRatio,
            child: VideoPlayer(controller),
          ),
          VideoProgressIndicator(
            controller,
            allowScrubbing: true,
            padding: const EdgeInsets.all(16),
          ),
          IconButton(
            tooltip: value.isPlaying ? '일시정지' : '영상 재생',
            onPressed: () async {
              try {
                value.isPlaying
                    ? await controller.pause()
                    : await controller.play();
              } catch (_) {
                if (mounted) {
                  setState(
                    () => _videoError = '영상 재생 중 문제가 발생했습니다. Drive에서 열어주세요.',
                  );
                }
              }
            },
            icon: Icon(value.isPlaying ? Icons.pause : Icons.play_arrow),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.file.name),
      actions: [
        IconButton(
          tooltip: 'Drive에서 열기',
          onPressed: _open,
          icon: const Icon(Icons.open_in_new),
        ),
      ],
    ),
    body: SafeArea(
      child: Column(
        children: [
          Expanded(
            child: Center(
              child: !widget.service.connected
                  ? const Text('Drive 연결이 해제됐습니다.')
                  : _loading == null
                  ? const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('이 파일은 Drive에서 열어 확인해주세요.'),
                    )
                  : FutureBuilder<Uint8List>(
                      future: _loading,
                      builder: (context, snapshot) {
                        if (snapshot.hasError) {
                          return Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              snapshot.error is DriveFailure
                                  ? (snapshot.error as DriveFailure).message
                                  : '미리보기를 불러오지 못했습니다. Drive에서 열어주세요.',
                            ),
                          );
                        }
                        if (!snapshot.hasData) {
                          return const Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CircularProgressIndicator(),
                              SizedBox(height: 20),
                              Text('미리보기를 불러오는 중…'),
                              SizedBox(height: 8),
                              Text(
                                '큰 파일은 시간이 걸릴 수 있습니다.',
                                style: TextStyle(
                                  color: Color(0xff667085),
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          );
                        }
                        if (_videoError != null) {
                          return Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(_videoError!),
                          );
                        }
                        if (_video != null) {
                          return SingleChildScrollView(child: _videoPlayer());
                        }
                        return InteractiveViewer(
                          minScale: .5,
                          maxScale: 5,
                          child: Image.memory(
                            snapshot.data!,
                            fit: BoxFit.contain,
                            errorBuilder: (_, _, _) =>
                                const Text('이 형식은 Drive에서 열어주세요.'),
                          ),
                        );
                      },
                    ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: OutlinedButton.icon(
              onPressed: _open,
              icon: const Icon(Icons.open_in_new, size: 18),
              label: const Text('Drive에서 열기'),
            ),
          ),
        ],
      ),
    ),
  );
}
