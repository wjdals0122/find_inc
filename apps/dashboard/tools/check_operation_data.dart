import 'dart:io';

import 'package:dashboard/operation_data.dart';

void check(bool value, String label) {
  if (!value) throw StateError(label);
}

void main() {
  check(
    metricDate(kstToday(DateTime.utc(2026, 11, 19, 16))) == '2026-11-20',
    'KST midnight boundary',
  );
  check(
    metricDate(kstToday(DateTime.utc(2026, 11, 19, 14))) == '2026-11-19',
    'Before KST midnight',
  );
  check(
    metricDays(DateTime.utc(2024, 2, 28), DateTime.utc(2024, 3, 1)).length == 3,
    'Leap day inclusion',
  );
  final rows = [
    ChannelMetricRow(
      1,
      'youtube',
      'a',
      '2026-11-10',
      'views',
      0,
      DateTime.utc(2026, 11, 11),
    ),
    ChannelMetricRow(
      2,
      'youtube',
      'b',
      '2026-11-10',
      'views',
      5,
      DateTime.utc(2026, 11, 12),
    ),
    ChannelMetricRow(
      3,
      'youtube',
      'a',
      '2026-11-12',
      'views',
      7,
      DateTime.utc(2026, 11, 13),
    ),
    ChannelMetricRow(
      4,
      'youtube',
      'a',
      '2026-11-10',
      'estimatedMinutesWatched',
      3.5,
      DateTime.utc(2026, 11, 11),
    ),
    ChannelMetricRow(
      5,
      'instagram',
      'a',
      '2026-11-10',
      'views',
      999,
      DateTime.utc(2026, 11, 11),
    ),
  ];
  final yt = filterMetrics(rows, 'youtube');
  final series = dailyMetrics(
    yt,
    'views',
    DateTime.utc(2026, 11, 10),
    DateTime.utc(2026, 11, 12),
  );
  check(
    series[0].value == 5,
    'Accounts aggregate without mixing channels or metric kinds',
  );
  check(series[1].value == null, 'Missing day stays missing');
  check(series[2].value == 7, 'Last day is inclusive');
  final one = dailyMetrics(
    filterMetrics(rows, 'youtube', account: 'a'),
    'views',
    DateTime.utc(2026, 11, 10),
    DateTime.utc(2026, 11, 12),
  );
  check(one.first.value == 0, 'Recorded zero is not missing');
  check(
    lastCollected(yt) == DateTime.utc(2026, 11, 13),
    'Collection freshness across rows',
  );
  check(
    filterMetrics(rows, 'google-search').isEmpty,
    'Unavailable channel remains empty',
  );
  stdout.writeln(
    'PASS: KST/leap-day boundaries, missing vs zero, account/channel/metric isolation, inclusive ranges, freshness.',
  );
}
