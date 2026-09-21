import 'package:material_ui/material_ui.dart';

import 'strategy_catalog.dart';
import 'strategy_reader.dart';

class StrategyGallery extends StatefulWidget {
  const StrategyGallery({
    super.key,
    required this.images,
    required this.reader,
  });
  final List<dynamic> images;
  final StrategyReader reader;

  @override
  State<StrategyGallery> createState() => _StrategyGalleryState();
}

class _StrategyGalleryState extends State<StrategyGallery> {
  final _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _move(int index) {
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.jumpToPage(index);
    } else {
      _controller.animateToPage(
        index,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.images.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Text('등록된 이미지가 없습니다.'),
      );
    }
    final selected = widget.images[_index];
    final item = selected is String ? {'asset': selected} : object(selected);
    return Column(
      children: [
        SizedBox(
          height: 224,
          child: PageView.builder(
            controller: _controller,
            itemCount: widget.images.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) {
              final raw = widget.images[i];
              final data = raw is String ? {'asset': raw} : object(raw);
              return Semantics(
                label: '이미지 ${i + 1}, ${text(data['alt'])}. 눌러서 확대',
                button: true,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: widget.reader.image(
                    context,
                    text(data['asset']),
                    height: 224,
                  ),
                ),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Row(
            children: [
              IconButton(
                tooltip: '이전 이미지',
                onPressed: _index == 0 ? null : () => _move(_index - 1),
                icon: const Icon(Icons.chevron_left),
              ),
              Expanded(
                child: Semantics(
                  liveRegion: true,
                  child: Column(
                    children: [
                      Text(
                        text(item['alt']),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xff667085),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${_index + 1} / ${widget.images.length}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xff667085),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              IconButton(
                tooltip: '다음 이미지',
                onPressed: _index == widget.images.length - 1
                    ? null
                    : () => _move(_index + 1),
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
