class OperationMetric {
  const OperationMetric(this.key, this.label, this.unit);
  final String key, label, unit;
}

class OperationChannel {
  const OperationChannel(
    this.id,
    this.name,
    this.letter,
    this.color,
    this.zone,
    this.metrics,
  );
  final String id, name, letter, zone;
  final int color;
  final List<OperationMetric> metrics;
  static const all = [
    OperationChannel('youtube', 'YouTube', 'Y', 0xfff17c70, '미국 태평양 시간', [
      OperationMetric('views', '조회수', '회'),
      OperationMetric('estimatedMinutesWatched', '시청 시간', '분'),
    ]),
    OperationChannel('instagram', 'Instagram', 'I', 0xffbd9bf6, '수집 데이터 기준', [
      OperationMetric('views', '조회수', '회'),
      OperationMetric('reach', '도달', '계정'),
    ]),
    OperationChannel(
      'google-search',
      'Search Console',
      'G',
      0xff73baa1,
      '미국 태평양 시간',
      [
        OperationMetric('impressions', '노출수', '회'),
        OperationMetric('clicks', '클릭수', '회'),
      ],
    ),
  ];
}

DateTime kstToday([DateTime? now]) {
  final kst = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 9));
  return DateTime.utc(kst.year, kst.month, kst.day);
}

String metricDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
List<DateTime> metricDays(DateTime start, DateTime end) => [
  for (var d = start; !d.isAfter(end); d = d.add(const Duration(days: 1))) d,
];

class ChannelMetricRow {
  ChannelMetricRow(
    this.id,
    this.channel,
    this.account,
    this.date,
    this.metric,
    this.value,
    this.collected,
  );
  factory ChannelMetricRow.fromJson(Map<String, dynamic> json) {
    final value = num.tryParse('${json['metric_value']}');
    if (value == null || !value.isFinite) {
      throw const FormatException('Invalid metric value');
    }
    return ChannelMetricRow(
      (json['id'] as num).toInt(),
      json['channel'] as String,
      json['account_id'] as String,
      json['metric_date'] as String,
      json['metric_name'] as String,
      value.toDouble(),
      DateTime.parse(json['collected_at'] as String).toUtc(),
    );
  }
  final int id;
  final String channel, account, date, metric;
  final double value;
  final DateTime collected;
}

class MetricPoint {
  const MetricPoint(this.day, this.value);
  final DateTime day;
  final double? value;
}

List<ChannelMetricRow> filterMetrics(
  List<ChannelMetricRow> rows,
  String channel, {
  String? account,
}) => rows
    .where(
      (r) => r.channel == channel && (account == null || r.account == account),
    )
    .toList();
List<MetricPoint> dailyMetrics(
  List<ChannelMetricRow> rows,
  String metric,
  DateTime start,
  DateTime end,
) {
  final sums = <String, double>{};
  for (final row in rows.where((r) => r.metric == metric)) {
    sums.update(row.date, (v) => v + row.value, ifAbsent: () => row.value);
  }
  return metricDays(
    start,
    end,
  ).map((day) => MetricPoint(day, sums[metricDate(day)])).toList();
}

DateTime? lastCollected(List<ChannelMetricRow> rows) => rows.isEmpty
    ? null
    : rows.map((r) => r.collected).reduce((a, b) => a.isAfter(b) ? a : b);
