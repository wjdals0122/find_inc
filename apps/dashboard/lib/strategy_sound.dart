import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:share_plus/share_plus.dart';

import 'strategy_reader.dart';

class StrategySound extends StatefulWidget {
  const StrategySound({super.key, required this.label});
  final String label;
  @override
  State<StrategySound> createState() => _StrategySoundState();
}

class _StrategySoundState extends State<StrategySound> {
  final _player = AudioPlayer();
  late final StreamSubscription<Duration> _positionSubscription;
  late final StreamSubscription<PlayerState> _stateSubscription;
  bool _playing = false, _prepared = false, _busy = false;
  double _position = 0;
  @override
  void initState() {
    super.initState();
    _positionSubscription = _player.onPositionChanged.listen((v) {
      if (mounted) {
        setState(() => _position = v.inMilliseconds.toDouble().clamp(0, 3000));
      }
    });
    _stateSubscription = _player.onPlayerStateChanged.listen((v) {
      if (mounted) {
        setState(() {
          _playing = v == PlayerState.playing;
          if (v == PlayerState.completed) _position = 0;
        });
      }
    });
  }

  Future<void> _toggle() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      if (_playing) {
        await _player.pause();
      } else {
        final offset = _position.round();
        if (!_prepared) {
          await _player.setSource(AssetSource('strategy/sound-logo-demo.wav'));
          _prepared = true;
        }
        await _player.seek(Duration(milliseconds: offset));
        await _player.resume();
      }
    } catch (_) {
      if (mounted) StrategyReader.notify(context, '오디오를 재생하지 못했습니다.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _positionSubscription.cancel();
    _stateSubscription.cancel();
    _player.dispose();
    super.dispose();
  }

  Future<void> _share() async {
    try {
      final data = await rootBundle.load('assets/strategy/sound-logo-demo.wav');
      if (!mounted) return;
      final box = context.findRenderObject() as RenderBox?;
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(data.buffer.asUint8List(), mimeType: 'audio/wav'),
          ],
          fileNameOverrides: ['sound-logo-demo.wav'],
          sharePositionOrigin: box == null
              ? null
              : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } catch (_) {
      if (mounted) StrategyReader.notify(context, '오디오를 내보내지 못했습니다.');
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
    child: Column(
      children: [
        Row(
          children: [
            IconButton(
              tooltip: _playing ? '일시정지' : '오디오 재생',
              onPressed: _busy ? null : _toggle,
              icon: Icon(
                _playing
                    ? Icons.pause_circle_outline
                    : Icons.play_circle_outline,
                size: 38,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(widget.label.isEmpty ? '사운드 로고' : widget.label),
            ),
            IconButton(
              tooltip: '예시 음원 내보내기',
              onPressed: _share,
              icon: const Icon(Icons.ios_share),
            ),
          ],
        ),
        Slider(
          value: _position,
          max: 3000,
          onChanged: (v) async {
            setState(() => _position = v);
            if (_prepared) {
              try {
                await _player.seek(Duration(milliseconds: v.round()));
              } catch (_) {}
            }
          },
        ),
        Text(
          '0:0${(_position / 1000).floor()} / 0:03',
          style: const TextStyle(fontSize: 12, color: Color(0xff667085)),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Text(
            '플레이어 확인용 3초 예시입니다. 공식 브랜드 음원이 아닙니다.',
            style: TextStyle(fontSize: 12, color: Color(0xff667085)),
          ),
        ),
      ],
    ),
  );
}
