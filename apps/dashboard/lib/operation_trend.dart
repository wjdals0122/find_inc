import 'dart:math' as math;

import 'package:intl/intl.dart' show NumberFormat;
import 'package:material_ui/material_ui.dart';

import 'operation_data.dart';

class OperationTrend extends StatefulWidget {
  const OperationTrend({
    super.key,
    required this.points,
    required this.color,
    required this.label,
    required this.unit,
  });
  final List<MetricPoint> points;
  final Color color;
  final String label, unit;
  @override
  State<OperationTrend> createState() => _OperationTrendState();
}

class _OperationTrendState extends State<OperationTrend> {
  int? _selected;
  @override
  Widget build(BuildContext context) {
    if (!widget.points.any((p) => p.value != null)) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Column(
          children: [
            Icon(Icons.show_chart, color: Color(0xff98a2b3), size: 30),
            SizedBox(height: 12),
            Text('아직 저장된 지표가 없습니다', style: TextStyle(fontSize: 13)),
            SizedBox(height: 6),
            Text(
              '데이터가 들어오면 날짜별 추이가 표시됩니다.',
              style: TextStyle(fontSize: 11, color: Color(0xff667085)),
            ),
          ],
        ),
      );
    }
    final index = _selected?.clamp(0, widget.points.length - 1);
    final point = index == null ? null : widget.points[index];
    final detail = point == null
        ? '그래프를 눌러 날짜별 수치를 확인하세요.'
        : '${metricDate(point.day)} · ${point.value == null ? '미제공' : '${NumberFormat('#,##0.##', 'ko_KR').format(point.value)} ${widget.unit}'}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          label: '${widget.label} 날짜별 추이. 누락 날짜는 선을 연결하지 않습니다.',
          value: detail,
          child: LayoutBuilder(
            builder: (context, c) => GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (d) => setState(
                () => _selected =
                    (((d.localPosition.dx - 44) /
                                math.max(1, c.maxWidth - 60)) *
                            (widget.points.length - 1))
                        .round()
                        .clamp(0, widget.points.length - 1),
              ),
              child: SizedBox(
                height: 186,
                width: double.infinity,
                child: CustomPaint(
                  painter: _TrendPainter(widget.points, widget.color, index),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          detail,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 11,
            color: Color(0xff667085),
            height: 1.6,
          ),
        ),
      ],
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.points, this.color, this.selected);
  final List<MetricPoint> points;
  final Color color;
  final int? selected;
  void _text(
    Canvas canvas,
    String text,
    Offset at, {
    bool centered = false,
    double? bound,
  }) {
    final p = TextPainter(
      text: TextSpan(
        text: text,
        style: const TextStyle(fontSize: 10, color: Color(0xff667085)),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    final x = centered
        ? (at.dx - p.width / 2).clamp(0, (bound ?? double.infinity) - p.width)
        : at.dx;
    p.paint(canvas, Offset(x.toDouble(), at.dy));
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;
    final values = points.where((p) => p.value != null).map((p) => p.value!);
    final low = math.min(0.0, values.isEmpty ? 0.0 : values.reduce(math.min));
    final high = math.max(1.0, values.isEmpty ? 1.0 : values.reduce(math.max));
    const left = 44.0, top = 12.0, bottom = 30.0;
    final width = math.max(1.0, size.width - left - 16),
        height = math.max(1.0, size.height - top - bottom);
    double x(int i) =>
        left + width * (points.length == 1 ? 0.5 : i / (points.length - 1));
    double y(double v) => top + height - (v - low) / (high - low) * height;
    final grid = Paint()
      ..color = const Color(0xffe2e6ed)
      ..strokeWidth = 1;
    for (final fraction in [0.0, .5, 1.0]) {
      final value = low + (high - low) * fraction;
      canvas.drawLine(
        Offset(left, y(value)),
        Offset(size.width - 16, y(value)),
        grid,
      );
      _text(
        canvas,
        NumberFormat.compact(locale: 'ko_KR').format(value),
        Offset(0, y(value) - 6),
      );
    }
    final line = Path();
    bool connected = false;
    for (int i = 0; i < points.length; i++) {
      final v = points[i].value;
      if (v == null) {
        connected = false;
        continue;
      }
      if (connected) {
        line.lineTo(x(i), y(v));
      } else {
        line.moveTo(x(i), y(v));
      }
      connected = true;
    }
    canvas.drawPath(
      line,
      Paint()
        ..color = color
        ..strokeWidth = 2.5
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round,
    );
    for (int i = 0; i < points.length; i++) {
      final v = points[i].value;
      if (v != null) {
        canvas.drawCircle(
          Offset(x(i), y(v)),
          selected == i ? 6 : 3.5,
          Paint()..color = color,
        );
      } else {
        canvas.drawLine(
          Offset(x(i) - 2, top + height),
          Offset(x(i) + 2, top + height),
          Paint()..color = const Color(0xff98a2b3),
        );
      }
    }
    for (final i in {0, (points.length - 1) ~/ 2, points.length - 1}) {
      _text(
        canvas,
        '${points[i].day.month}/${points[i].day.day}',
        Offset(x(i), size.height - 17),
        centered: true,
        bound: size.width,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _TrendPainter old) =>
      old.points != points || old.color != color || old.selected != selected;
}
