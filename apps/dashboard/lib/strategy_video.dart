import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

class StrategyVideo extends StatefulWidget {
  const StrategyVideo({super.key, required this.asset});
  final String asset;
  @override
  State<StrategyVideo> createState() => _StrategyVideoState();
}

class _StrategyVideoState extends State<StrategyVideo> {
  late final VideoPlayerController _controller = VideoPlayerController.asset(
    widget.asset,
  );
  late final Future<void> _ready = _controller.initialize();
  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    try {
      if (_controller.value.isPlaying) {
        await _controller.pause();
      } else {
        await _controller.play();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('동영상을 재생하지 못했습니다.')));
      }
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<void>(
    future: _ready,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return const Text('이 기기에서 동영상을 재생할 수 없습니다. 상단 메뉴로 파일을 내보낼 수 있습니다.');
      }
      if (snapshot.connectionState != ConnectionState.done) {
        return const CircularProgressIndicator();
      }
      return ValueListenableBuilder<VideoPlayerValue>(
        valueListenable: _controller,
        builder: (context, value, child) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AspectRatio(
              aspectRatio: value.aspectRatio,
              child: VideoPlayer(_controller),
            ),
            VideoProgressIndicator(
              _controller,
              allowScrubbing: true,
              padding: const EdgeInsets.all(16),
            ),
            IconButton(
              tooltip: value.isPlaying ? '일시정지' : '동영상 재생',
              onPressed: _toggle,
              icon: Icon(value.isPlaying ? Icons.pause : Icons.play_arrow),
            ),
          ],
        ),
      );
    },
  );
}
