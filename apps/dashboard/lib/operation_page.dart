import 'dart:async';

import 'package:intl/intl.dart' show NumberFormat;
import 'package:material_ui/material_ui.dart';

import 'operation_data.dart';
import 'operation_repository.dart';
import 'operation_trend.dart';

class OperationPage extends StatefulWidget {
  const OperationPage({super.key});
  @override
  State<OperationPage> createState() => _OperationPageState();
}

class _OperationPageState extends State<OperationPage> {
  final _repository = OperationRepository();
  late DateTime _end = kstToday().subtract(const Duration(days: 1));
  late DateTime _start = _end.subtract(const Duration(days: 6));
  List<ChannelMetricRow> _rows = [];
  String _channel = 'youtube';
  String? _account, _error;
  bool _loading = false;
  int _revision = 0;
  DateTime? _fetched;
  OperationChannel get channel =>
      OperationChannel.all.firstWhere((c) => c.id == _channel);
  List<ChannelMetricRow> get selected =>
      filterMetrics(_rows, _channel, account: _account);
  List<DateTime> get days => metricDays(_start, _end);
  String _number(num n) => NumberFormat('#,##0.##', 'ko_KR').format(n);
  String _stamp(DateTime? value) {
    if (value == null) return '수집 기록 없음';
    final d = value.toUtc().add(const Duration(hours: 9));
    return '${d.month}/${d.day} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')} KST';
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _revision++;
    unawaited(_repository.dispose());
    super.dispose();
  }

  Future<void> _load() async {
    final run = ++_revision;
    setState(() {
      _loading = true;
      _error = null;
      _rows = [];
      _fetched = null;
    });
    try {
      final rows = await _repository.load(_start, _end);
      if (!mounted || run != _revision) return;
      setState(() {
        _rows = rows;
        _fetched = DateTime.now().toUtc();
        if (_account != null &&
            !rows.any((r) => r.channel == _channel && r.account == _account)) {
          _account = null;
        }
      });
    } catch (_) {
      if (mounted && run == _revision) {
        setState(() => _error = '성과를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
      }
    } finally {
      if (mounted && run == _revision) setState(() => _loading = false);
    }
  }

  void _period(int n) {
    setState(() => _start = _end.subtract(Duration(days: n - 1)));
    _load();
  }

  Future<void> _chooseDates() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2000),
      lastDate: kstToday(),
      initialDateRange: DateTimeRange(start: _start, end: _end),
      helpText: '조회 기간 선택 · 최대 366일',
      saveText: '적용',
      cancelText: '취소',
      confirmText: '확인',
      fieldStartLabelText: '시작 날짜',
      fieldEndLabelText: '종료 날짜',
    );
    if (!mounted || picked == null) return;
    final start = DateTime.utc(
          picked.start.year,
          picked.start.month,
          picked.start.day,
        ),
        end = DateTime.utc(picked.end.year, picked.end.month, picked.end.day);
    if (end.difference(start).inDays > 365) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('기간은 시작일부터 최대 366일까지 선택해주세요.')),
      );
      return;
    }
    setState(() {
      _start = start;
      _end = end;
    });
    _load();
  }

  Widget _note(String s) => Text(
    s,
    style: const TextStyle(fontSize: 11, height: 1.7, color: Color(0xff667085)),
  );
  Widget _panel(List<Widget> children) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: const Color(0xffe2e6ed)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children,
    ),
  );
  Widget _hero() => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 20),
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: const Color(0xff14231f),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: const Color(0xff294137)),
    ),
    child: Stack(
      children: [
        const Positioned(
          right: -70,
          top: 15,
          child: IgnorePointer(
            child: ExcludeSemantics(
              child: CustomPaint(size: Size(250, 250), painter: _HeroPainter()),
            ),
          ),
        ),
        const Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'OPERATION / CHANNEL INTELLIGENCE',
                style: TextStyle(
                  fontSize: 9,
                  letterSpacing: 1.3,
                  fontWeight: FontWeight.w600,
                  color: Color(0xffd4f7a3),
                ),
              ),
              SizedBox(height: 22),
              Text(
                '작은 움직임에서,',
                style: TextStyle(
                  fontSize: 28,
                  height: 1.3,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -1,
                  color: Color(0xfff0f6ec),
                ),
              ),
              Text(
                '다음 성장까지.',
                style: TextStyle(
                  fontSize: 28,
                  height: 1.3,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -1,
                  color: Color(0xffd4f7a3),
                ),
              ),
              SizedBox(height: 18),
              Text(
                '채널마다 다른 신호를 한곳에서 읽으세요.\n수집된 숫자와 비어 있는 날짜까지, 있는 그대로.',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.8,
                  color: Color(0xffb0c0b7),
                ),
              ),
              SizedBox(height: 24),
              Text(
                '03 CHANNELS  —  ONE CONNECTED VIEW',
                style: TextStyle(
                  fontSize: 8,
                  letterSpacing: 1.2,
                  color: Color(0xff8caa98),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
  Widget _channelCards() => LayoutBuilder(
    builder: (context, constraints) {
      final min = 100 * MediaQuery.textScalerOf(context).scale(14) / 14;
      final columns = constraints.maxWidth >= min * 3 + 16
          ? 3
          : constraints.maxWidth >= min * 2 + 8
          ? 2
          : 1;
      return Wrap(
        spacing: 8,
        runSpacing: 8,
        children: OperationChannel.all.map((c) {
          final rows = filterMetrics(_rows, c.id),
              count = rows.map((r) => r.date).toSet().length;
          final active = _channel == c.id;
          return SizedBox(
            width: (constraints.maxWidth - (columns - 1) * 8) / columns,
            child: Semantics(
              selected: active,
              button: true,
              child: Material(
                color: active ? const Color(0xffeef3ef) : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(
                    color: active
                        ? const Color(0xff8fb69c)
                        : const Color(0xffe2e6ed),
                  ),
                ),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => setState(() {
                    _channel = c.id;
                    _account = null;
                  }),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Color(c.color).withValues(alpha: .18),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            c.letter,
                            style: TextStyle(
                              color: Color(c.color),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          c.name,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 18),
                        _note(
                          _loading
                              ? '조회 중'
                              : count > 0
                              ? '$count일 저장'
                              : '저장 데이터 없음',
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      );
    },
  );
  Widget _metric(OperationMetric metric, int index) {
    final points = dailyMetrics(selected, metric.key, _start, _end),
        valid = points.where((p) => p.value != null).toList();
    final total = valid.fold<double>(0, (s, p) => s + p.value!);
    return _panel([
      Wrap(
        spacing: 12,
        runSpacing: 8,
        children: [
          Text(
            metric.label,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
          _note('${valid.length}/${days.length}일 제공'),
        ],
      ),
      const SizedBox(height: 16),
      Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: _loading
                  ? '…'
                  : valid.isEmpty
                  ? '—'
                  : _number(total),
              style: const TextStyle(
                fontSize: 38,
                fontWeight: FontWeight.w500,
                letterSpacing: -1.5,
              ),
            ),
            TextSpan(
              text: '  ${metric.unit}',
              style: const TextStyle(fontSize: 13, color: Color(0xff667085)),
            ),
          ],
        ),
      ),
      const SizedBox(height: 6),
      _note(
        metric.key == 'reach'
            ? '제공된 날짜 합계 · 일별 도달 합계이며 기간 순도달과 다릅니다.'
            : valid.isEmpty
            ? '기간 내 저장 데이터 없음'
            : '제공된 날짜 합계',
      ),
      const SizedBox(height: 18),
      if (_loading)
        const SizedBox(
          height: 150,
          child: Center(child: CircularProgressIndicator()),
        )
      else
        OperationTrend(
          key: ValueKey('$_channel/$_account/${metric.key}/$_start/$_end'),
          points: points,
          color: index == 0 ? Color(channel.color) : const Color(0xff8d9ac8),
          label: metric.label,
          unit: metric.unit,
        ),
    ]);
  }

  Widget _coverage() {
    final collected = selected.map((r) => r.date).toSet();
    return _panel([
      Text(
        '수집 커버리지  ${collected.length} / ${days.length}일',
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 18),
      Wrap(
        spacing: 5,
        runSpacing: 6,
        children: days.map((d) {
          final label =
              '${metricDate(d)} · ${collected.contains(metricDate(d)) ? '저장 데이터 있음' : '미제공'}';
          return Tooltip(
            message: label,
            child: Semantics(
              label: label,
              child: Container(
                width: days.length <= 14 ? 28 : 12,
                height: 18,
                decoration: BoxDecoration(
                  color: collected.contains(metricDate(d))
                      ? const Color(0xff8fb69c)
                      : const Color(0xffeef0f4),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
          );
        }).toList(),
      ),
      const SizedBox(height: 14),
      _note('초록: 저장 데이터 있음 · 회색: 미제공'),
      const SizedBox(height: 8),
      _note('미제공 날짜는 0으로 계산하지 않습니다.'),
    ]);
  }

  Widget _table() {
    final series = [
      for (final m in channel.metrics)
        dailyMetrics(selected, m.key, _start, _end),
    ];
    return ExpansionTile(
      key: PageStorageKey('table/$_channel/$_account/$_start/$_end'),
      tilePadding: EdgeInsets.zero,
      title: const Text(
        '날짜별 원본 지표',
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
      subtitle: _note('${selected.length}개 저장 행 · 계정 선택 기준 일별 합산'),
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: DataTable(
            columns: [
              const DataColumn(label: Text('날짜')),
              for (final m in channel.metrics)
                DataColumn(label: Text('${m.label} (${m.unit})')),
              const DataColumn(label: Text('수집 시각 (KST)')),
            ],
            rows: List.generate(
              days.length,
              (i) => DataRow(
                cells: [
                  DataCell(Text(metricDate(days[i]))),
                  for (int m = 0; m < channel.metrics.length; m++)
                    DataCell(
                      Text(
                        series[m][i].value == null
                            ? '미제공'
                            : _number(series[m][i].value!),
                      ),
                    ),
                  DataCell(
                    Text(
                      _stamp(
                        lastCollected(
                          selected
                              .where((r) => r.date == metricDate(days[i]))
                              .toList(),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final accounts = {
      ...filterMetrics(_rows, _channel).map((r) => r.account),
      ?_account,
    }.toList()..sort();
    return ColoredBox(
      color: const Color(0xfff9fafb),
      child: SafeArea(
        top: false,
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            key: const PageStorageKey('operation'),
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: [
              _hero(),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  for (final n in [7, 14, 30])
                    ChoiceChip(
                      label: Text('$n일'),
                      selected: _end.difference(_start).inDays == n - 1,
                      onSelected: (_) => _period(n),
                    ),
                  OutlinedButton.icon(
                    onPressed: _loading ? null : _load,
                    icon: const Icon(Icons.refresh, size: 17),
                    label: const Text('새로고침'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _chooseDates,
                icon: const Icon(Icons.calendar_today_outlined, size: 17),
                label: Text(
                  '${metricDate(_start)} — ${metricDate(_end)}',
                  style: const TextStyle(fontSize: 12),
                ),
              ),
              const SizedBox(height: 12),
              Semantics(
                liveRegion: true,
                child: Text(
                  _loading
                      ? '저장된 성과를 불러오고 있습니다.'
                      : _error ?? 'Supabase 직접 조회 · 화면 조회 ${_stamp(_fetched)}',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.7,
                    color: _error == null
                        ? const Color(0xff667085)
                        : const Color(0xffb42318),
                  ),
                ),
              ),
              if (_error != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: _load,
                    child: const Text('다시 시도'),
                  ),
                ),
              const SizedBox(height: 20),
              _channelCards(),
              const SizedBox(height: 24),
              const Text(
                'DAILY PERFORMANCE',
                style: TextStyle(
                  fontSize: 9,
                  letterSpacing: 1.3,
                  color: Color(0xff667085),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                '${channel.name} 날짜별 추이',
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -.5,
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: ValueKey('$_channel/$_account/${accounts.join(',')}'),
                initialValue: _account ?? '__all__',
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: '계정 선택',
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                items: [
                  const DropdownMenuItem(
                    value: '__all__',
                    child: Text('모든 계정'),
                  ),
                  for (final account in accounts)
                    DropdownMenuItem(
                      value: account,
                      child: Text(account, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) =>
                    setState(() => _account = v == '__all__' ? null : v),
              ),
              const SizedBox(height: 20),
              for (int i = 0; i < channel.metrics.length; i++)
                _metric(channel.metrics[i], i),
              _coverage(),
              _panel([
                const Text(
                  'LAST COLLECTED',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.3,
                    color: Color(0xff667085),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  _stamp(lastCollected(selected)),
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 8),
                _note('지표 수집 시각 · ${channel.zone}'),
                const SizedBox(height: 12),
                _note('새로고침은 저장 데이터 조회이며 채널 API 수집을 실행하지 않습니다.'),
              ]),
              _table(),
              const SizedBox(height: 24),
              _note('FIND.INC / OPERATION\n서비스별 집계 시간대 적용'),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroPainter extends CustomPainter {
  const _HeroPainter();
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0x22d4f7a3)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final center = Offset(size.width / 2, size.height / 2);
    for (final radius in [65.0, 90.0, 115.0]) {
      canvas.drawCircle(center, radius, paint);
    }
    final colors = [
      const Color(0xffcde7bb),
      const Color(0xffb8a3d8),
      const Color(0xffe9bfa0),
    ];
    final positions = [
      const Offset(90, 18),
      const Offset(40, 110),
      const Offset(195, 170),
    ];
    for (int i = 0; i < 3; i++) {
      canvas.drawCircle(
        positions[i],
        15,
        Paint()..color = colors[i].withValues(alpha: .3),
      );
      final label = TextPainter(
        text: TextSpan(
          text: ['Y', 'I', 'G'][i],
          style: const TextStyle(fontSize: 12, color: Color(0x99f0f6ec)),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      label.paint(
        canvas,
        positions[i] - Offset(label.width / 2, label.height / 2),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _HeroPainter old) => false;
}
