import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'operation_data.dart';

class OperationRepository {
  // This is a public, read-only Data API client. It never receives Firebase tokens
  // or a Supabase service-role/secret key and does not restore Supabase sessions.
  final SupabaseClient _client = SupabaseClient(
    'https://jktfoktelryczucpzvcu.supabase.co',
    'sb_publishable_XIN0FQrGc3wRjcDvo4fYGQ_Clw0UzUb',
    authOptions: const AuthClientOptions(autoRefreshToken: false),
  );
  Future<List<ChannelMetricRow>> load(DateTime start, DateTime end) async {
    if (end.isBefore(start) || end.difference(start).inDays > 365) {
      throw ArgumentError('기간은 시작일부터 최대 366일까지 선택해주세요.');
    }
    final output = <ChannelMetricRow>[];
    int offset = 0;
    int? total;
    do {
      final response = await _client
          .from('channel_metrics')
          .select(
            'id,channel,account_id,metric_date,metric_name,metric_value,collected_at',
          )
          .gte('metric_date', metricDate(start))
          .lte('metric_date', metricDate(end))
          .order('metric_date', ascending: true)
          .order('id', ascending: true)
          .range(offset, offset + 499)
          .count(CountOption.exact)
          .timeout(const Duration(seconds: 30));
      total ??= response.count;
      final rows = response.data;
      if (rows.isEmpty) {
        if (offset < total) throw StateError('Incomplete metrics response');
        break;
      }
      output.addAll(rows.map(ChannelMetricRow.fromJson));
      offset += rows.length;
    } while (offset < total);
    return output;
  }

  Future<void> dispose() => _client.dispose();
}
